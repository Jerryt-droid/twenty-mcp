import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { TwentyClient } from "../client/twenty-client.js";

// Supported field types for create_field. Mirrors Twenty's FieldMetadataType.
const FIELD_TYPES = [
  "TEXT",
  "NUMBER",
  "BOOLEAN",
  "DATE_TIME",
  "DATE",
  "CURRENCY",
  "SELECT",
  "MULTI_SELECT",
  "RATING",
  "EMAILS",
  "PHONES",
  "LINKS",
  "ADDRESS",
  "FULL_NAME",
  "RICH_TEXT",
  "RAW_JSON",
  "UUID",
  "POSITION",
] as const;

// Metadata API write tools. These let Claude BUILD new data models — create
// custom objects and add custom fields — via Twenty's /metadata GraphQL endpoint.
// No destructive operations are exposed by design.
export function registerMetadataWriteTools(
  server: McpServer,
  client: TwentyClient,
) {
  server.tool(
    "create_object",
    'Create a new custom object (data model) in Twenty CRM. Names are camelCase (e.g. "project"/"projects"); labels are human-readable. A default "name" text field is created automatically.',
    {
      nameSingular: z
        .string()
        .describe('camelCase singular API name, e.g. "project"'),
      namePlural: z
        .string()
        .describe('camelCase plural API name, e.g. "projects"'),
      labelSingular: z.string().describe('Human label, e.g. "Project"'),
      labelPlural: z.string().describe('Human label plural, e.g. "Projects"'),
      description: z.string().optional().describe("Object description"),
      icon: z
        .string()
        .optional()
        .describe('Icon name, e.g. "IconBriefcase" (Tabler icon)'),
    },
    async (args) => {
      try {
        const object = await client.createObject(args);
        return {
          content: [
            {
              type: "text" as const,
              text: `Created object "${object.labelSingular}" (${object.nameSingular}, ID: ${object.id}). You can now add fields with create_field.`,
            },
          ],
          data: object,
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to create object: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "create_field",
    [
      "Add a new field (including custom fields) to an object.",
      "Provide the object by name and the field name (camelCase), label, and type.",
      "For SELECT/MULTI_SELECT, provide `options` (value + label, optional color/position).",
    ].join(" "),
    {
      objectName: z
        .string()
        .describe("Object to add the field to (singular or plural name)"),
      name: z.string().describe('camelCase field API name, e.g. "industry"'),
      label: z.string().describe('Human label, e.g. "Industry"'),
      type: z.enum(FIELD_TYPES).describe("Field type"),
      description: z.string().optional().describe("Field description"),
      icon: z.string().optional().describe("Icon name (Tabler)"),
      isNullable: z
        .boolean()
        .optional()
        .default(true)
        .describe("Whether the field can be empty"),
      defaultValue: z
        .any()
        .optional()
        .describe("Default value (type-dependent)"),
      options: z
        .array(
          z.object({
            value: z.string().describe('Stored value, e.g. "TECH"'),
            label: z.string().describe('Display label, e.g. "Technology"'),
            color: z
              .string()
              .optional()
              .describe('Color name, e.g. "green", "blue"'),
            position: z.number().optional().describe("Order position"),
          }),
        )
        .optional()
        .describe("Options for SELECT / MULTI_SELECT fields"),
    },
    async (args) => {
      try {
        const objectMetadataId = await client.resolveObjectMetadataId(
          args.objectName,
        );
        // Normalize option positions if omitted so the API gets a stable order.
        const options = args.options?.map((opt, index) => ({
          ...opt,
          position: opt.position ?? index,
        }));

        const field = await client.createField({
          objectMetadataId,
          name: args.name,
          label: args.label,
          type: args.type,
          description: args.description,
          icon: args.icon,
          isNullable: args.isNullable,
          defaultValue: args.defaultValue,
          options,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Created field "${field.label}" (${field.name}, type ${field.type}) on ${args.objectName}.`,
            },
          ],
          data: field,
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to create field: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "update_field",
    "Update a field by its metadata ID. Use to rename, change description/icon, or deactivate a field (isActive:false). Find the field ID via get_object_schema/get_field_metadata.",
    {
      fieldId: z.string().describe("Field metadata ID"),
      label: z.string().optional().describe("New label"),
      description: z.string().optional().describe("New description"),
      icon: z.string().optional().describe("New icon"),
      isActive: z
        .boolean()
        .optional()
        .describe("Set false to deactivate (hide) the field"),
      isNullable: z
        .boolean()
        .optional()
        .describe("Whether the field can be empty"),
      defaultValue: z.any().optional().describe("New default value"),
    },
    async ({ fieldId, ...update }) => {
      try {
        // Drop undefined keys so we only send what was provided.
        const cleaned = Object.fromEntries(
          Object.entries(update).filter(([, value]) => value !== undefined),
        );
        const field = await client.updateField(fieldId, cleaned);
        return {
          content: [
            {
              type: "text" as const,
              text: `Updated field "${field.label}" (${field.name}).`,
            },
          ],
          data: field,
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to update field: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
