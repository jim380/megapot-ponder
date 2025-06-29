# MCP Tool Schema Definitions

This directory contains JSON Schema definitions for all MCP tool parameters. These schemas are used to validate tool call parameters before execution, ensuring type safety and preventing malformed requests.

## Overview

The schema validation system provides:

- **Type Safety**: Ensures all parameters match expected types
- **Range Validation**: Enforces minimum/maximum values for numeric parameters
- **Format Validation**: Validates Ethereum addresses, BigInt strings, and timestamps
- **Enum Validation**: Ensures string values match allowed options
- **Required Fields**: Enforces mandatory parameters
- **Additional Properties**: Prevents unknown fields from being passed

## Schema Structure

### Common Schemas

Located in `tool-schemas.ts`, reusable schema components include:

- **pagination**: Standard pagination parameters (first, skip)
- **orderDirection**: Sort direction (asc, desc)
- **ethereumAddress**: Valid Ethereum address format
- **bigIntString**: Numeric string for BigInt values
- **timestamp**: Unix timestamp validation
- **boolean**: Boolean type validation

### Tool-Specific Schemas

Each tool has its own schema definition:

1. **queryUsers**: Query users with filters for activity, LP status, winnings
2. **queryRounds**: Query jackpot rounds with status and time filters
3. **queryTickets**: Query tickets with buyer/recipient/round filters
4. **queryLPs**: Query liquidity providers with stake and risk filters
5. **getCurrentRound**: No parameters (gets active round)
6. **getProtocolStats**: No parameters (gets latest stats)
7. **getUserStats**: Requires Ethereum address
8. **getLpStats**: Requires Ethereum address
9. **getLeaderboard**: Requires type (users/lps) and optional limit
10. **getHourlyStats**: Time range and limit parameters

## Validation Flow

1. **Request Received**: MCP server receives tool call request
2. **Schema Lookup**: Appropriate schema retrieved based on tool name
3. **Validation**: AJV validates parameters against schema
4. **Error Formatting**: Validation errors converted to user-friendly messages
5. **Success/Failure**: Valid parameters passed to tool executor, or error returned

## Error Messages

The validation middleware provides detailed error messages:

```typescript
{
  field: "first",
  message: "Value must be at least 1",
  value: 0
}
```

## Adding New Tools

To add a new tool schema:

1. Define the schema in `tool-schemas.ts`:
```typescript
export const myToolSchema: JSONSchema7 = {
  type: 'object',
  properties: {
    // Define parameters
  },
  required: ['requiredField'],
  additionalProperties: false
};
```

2. Add to `toolSchemas` mapping:
```typescript
export const toolSchemas: Record<string, JSONSchema7> = {
  // ... existing tools
  myTool: myToolSchema
};
```

3. Implement the tool executor in `tools/execution.ts`

## Testing

Run validation tests:
```bash
npm test -- validation/__tests__/schema-validation.test.ts
```

## Custom Formats

The system supports custom formats:

- **ethereum-address**: `^0x[a-fA-F0-9]{40}$`
- **bigint-string**: `^[0-9]+$`

Additional formats can be added in `validation/middleware.ts`.