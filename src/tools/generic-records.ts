import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { TwentyClient } from "../client/twenty-client.js";

// Generic, schema-driven record tools. Unlike the named tools (create_opportunity
// etc.) these work against ANY object — standard or custom — and automatically
// include every active custom field, because the GraphQL is built at call time
// from the object's metadata. This is what makes custom fields searchable,
// readable and writable without editing this server per field.
export function registerGenericRecordTools(
  server: McpServer,
  client: TwentyClient,
) {
  server.tool(
    "query_records",
    [
      "Search/list records of ANY Twenty object (standard or custom) with full custom-field support.",
      "Returns all active non-relation fields by default (custom fields included).",
      'filter is a raw Twenty GraphQL filter object, e.g. {"name":{"ilike":"%acme%"}}, {"stage":{"eq":"PROPOSAL"}}, {"amount":{"amountMicros":{"gte":1000000}}}.',
      "Common operands: eq, neq, gt, gte, lt, lte, ilike (case-insensitive contains), in, is (NULL/NOT_NULL). Combine with and/or arrays.",
      'To read relation fields, pass them explicitly via `fields` with their sub-selection, e.g. ["id","name","company { id name }"]. Tip: call get_object_schema first to discover field names.',
    ].join(" "),
    {
      objectName: z
        .string()
        .describe(
          'Object name, singular or plural (e.g. "opportunity", "opportunities", or a custom object name)',
        ),
      filter: z
        .record(z.any())
        .optional()
        .describe(
          "Raw Twenty filter object (see tool description for operands)",
        ),
      limit: z.number().optional().default(20).describe("Max results"),
      offset: z.number().optional().default(0).describe("Results to skip"),
      fields: z
        .array(z.string())
        .optional()
        .describe(
          "Explicit GraphQL selection (overrides auto-selection); use for relation fields",
        ),
      includeSystemFields: z
        .boolean()
        .optional()
        .default(false)
        .describe("Include system fields (createdAt, etc.) in auto-selection"),
    },
    async (args) => {
      try {
        const { records, totalCount } = await client.queryRecords(args);
        return {
          content: [
            {
              type: "text" as const,
              text: `Found ${totalCount} ${args.objectName} record(s) (showing ${records.length}):\n\n${JSON.stringify(records, null, 2)}`,
            },
          ],
          data: { records, totalCount },
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to query ${args.objectName}: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "get_record",
    "Get a single record of ANY object by ID, including all custom fields. Pass optional `fields` for an explicit selection (e.g. to include relations).",
    {
      objectName: z.string().describe("Object name, singular or plural"),
      id: z.string().describe("Record ID"),
      fields: z
        .array(z.string())
        .optional()
        .describe("Explicit GraphQL selection (optional)"),
    },
    async ({ objectName, id, fields }) => {
      try {
        const record = await client.getRecordById(objectName, id, fields);
        if (!record) {
          return {
            content: [
              {
                type: "text" as const,
                text: `${objectName} with ID ${id} not found`,
              },
            ],
            isError: true,
          };
        }
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(record, null, 2) },
          ],
          data: record,
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to get ${objectName}: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "create_record",
    [
      "Create a record on ANY object (standard or custom) with arbitrary fields including custom ones.",
      "`data` is the raw create input keyed by field name. Composite fields use nested shapes:",
      "CURRENCY {amountMicros, currencyCode}; FULL_NAME {firstName, lastName}; EMAILS {primaryEmail}; PHONES {primaryPhoneNumber, primaryPhoneCallingCode}; LINKS {primaryLinkUrl, primaryLinkLabel}; ADDRESS {addressStreet1, addressCity, addressCountry, ...}.",
      "Relations are set via their foreign-key id field (e.g. companyId). Call get_object_schema first to confirm field names/types.",
    ].join(" "),
    {
      objectName: z.string().describe("Object name, singular or plural"),
      data: z
        .record(z.any())
        .describe(
          "Field values keyed by field name (see description for composite shapes)",
        ),
    },
    async ({ objectName, data }) => {
      try {
        const record = await client.createRecord(objectName, data);
        return {
          content: [
            {
              type: "text" as const,
              text: `Created ${objectName} (ID: ${record.id}):\n\n${JSON.stringify(record, null, 2)}`,
            },
          ],
          data: record,
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to create ${objectName}: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "update_record",
    "Update a record on ANY object by ID, including custom fields. `data` is keyed by field name (same composite shapes as create_record).",
    {
      objectName: z.string().describe("Object name, singular or plural"),
      id: z.string().describe("Record ID to update"),
      data: z
        .record(z.any())
        .describe("Field values to update, keyed by field name"),
    },
    async ({ objectName, id, data }) => {
      try {
        const record = await client.updateRecord(objectName, id, data);
        return {
          content: [
            {
              type: "text" as const,
              text: `Updated ${objectName} (ID: ${record.id}):\n\n${JSON.stringify(record, null, 2)}`,
            },
          ],
          data: record,
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to update ${objectName}: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
