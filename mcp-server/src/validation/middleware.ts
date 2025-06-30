import Ajv, { type ErrorObject, type SchemaObject } from "ajv";
import addFormats from "ajv-formats";
import type { JSONSchema7 } from "json-schema";
import type { CallToolRequest } from "@modelcontextprotocol/sdk/types.js";

import { getToolSchema } from "../schemas/tool-schemas.js";
import {
  MCPError,
  SchemaValidationError,
  InvalidParametersError,
  UnsupportedOperationError,
} from "../errors/index.js";
import { serverLogger as logger } from "../logging/index.js";

const ajv = new Ajv({
  allErrors: true,
  verbose: true,
  strict: false,
  removeAdditional: "all",
  useDefaults: true,
  coerceTypes: true,
});

addFormats(ajv);

ajv.addFormat("ethereum-address", {
  type: "string",
  validate: (value: string) => /^0x[a-fA-F0-9]{40}$/.test(value),
});

ajv.addFormat("bigint-string", {
  type: "string",
  validate: (value: string) => /^[0-9]+$/.test(value),
});

export interface ValidationResult<T = unknown> {
  valid: boolean;
  data?: T;
  errors?: ValidationError[];
}

export interface ValidationError {
  field: string;
  message: string;
  value?: unknown;
  allowedValues?: unknown[];
}

interface RequiredParams {
  missingProperty: string;
}

interface EnumParams {
  allowedValues: unknown[];
}

interface PatternParams {
  pattern: string;
}

interface LimitParams {
  limit: number;
}

interface TypeParams {
  type: string;
}

interface AdditionalPropertiesParams {
  additionalProperty: string;
}

function formatValidationErrors(errors: ErrorObject[]): ValidationError[] {
  return errors.map((error) => {
    const field = error.instancePath || error.schemaPath || "root";
    let message = error.message ?? "Validation failed";
    let allowedValues: unknown[] | undefined;

    switch (error.keyword) {
      case "required": {
        const params = error.params as RequiredParams;
        message = `Missing required field: ${params.missingProperty}`;
        break;
      }
      case "enum": {
        const params = error.params as EnumParams;
        allowedValues = params.allowedValues;
        message = `Invalid value. Allowed values: ${params.allowedValues.map((v) => String(v)).join(", ")}`;
        break;
      }
      case "pattern": {
        const params = error.params as PatternParams;
        if (error.schemaPath?.includes("ethereumAddress")) {
          message = "Invalid Ethereum address format (must be 0x followed by 40 hex characters)";
        } else if (error.schemaPath?.includes("bigIntString")) {
          message = "Invalid BigInt format (must contain only numeric digits)";
        } else {
          message = `Value does not match required pattern: ${params.pattern}`;
        }
        break;
      }
      case "minimum": {
        const params = error.params as LimitParams;
        message = `Value must be at least ${params.limit}`;
        break;
      }
      case "maximum": {
        const params = error.params as LimitParams;
        message = `Value must be at most ${params.limit}`;
        break;
      }
      case "type": {
        const params = error.params as TypeParams;
        message = `Expected ${params.type} but received ${typeof error.data}`;
        break;
      }
      case "additionalProperties": {
        const params = error.params as AdditionalPropertiesParams;
        message = `Unknown field: ${params.additionalProperty}`;
        break;
      }
    }

    return {
      field: field.replace(/^\//, "").replace(/\//g, ".") || "root",
      message,
      value: error.data,
      ...(allowedValues !== undefined && { allowedValues }),
    };
  });
}

export function validateToolParameters<T = unknown>(
  toolName: string,
  parameters: unknown
): ValidationResult<T> {
  const schema = getToolSchema(toolName);

  if (!schema) {
    logger.warn({ toolName }, "No schema found for tool");
    throw new UnsupportedOperationError(
      `Tool '${toolName}' is not supported`,
      "No validation schema available"
    );
  }

  let validate;
  try {
    validate = ajv.compile({
      ...schema,
      $async: false,
    } as SchemaObject);
  } catch (error) {
    logger.error({ error, toolName, schema }, "Failed to compile schema");
    throw new MCPError(1500, "Schema compilation failed", { toolName, error });
  }

  const valid = validate(parameters);

  if (!valid && validate.errors) {
    const validationErrors = formatValidationErrors(validate.errors);

    logger.debug(
      {
        toolName,
        parameters,
        errors: validationErrors,
      },
      "Parameter validation failed"
    );

    return {
      valid: false,
      errors: validationErrors,
    };
  }

  return {
    valid: true,
    data: parameters as T,
  };
}

// eslint-disable-next-line @typescript-eslint/require-await
export async function validateMCPToolCall(
  request: CallToolRequest
): Promise<{ toolName: string; validatedParams: unknown }> {
  const { name: toolName, arguments: rawParams } = request.params;

  logger.debug(
    {
      toolName,
      rawParams,
    },
    "Validating tool call parameters"
  );

  try {
    const result = validateToolParameters(toolName, rawParams || {});

    if (!result.valid) {
      throw new SchemaValidationError(result.errors || []);
    }

    logger.debug(
      {
        toolName,
        validatedParams: result.data,
      },
      "Tool parameters validated successfully"
    );

    return {
      toolName,
      validatedParams: result.data,
    };
  } catch (error) {
    if (error instanceof MCPError) {
      throw error;
    }

    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        toolName,
        rawParams,
      },
      "Unexpected validation error"
    );

    throw new InvalidParametersError(
      "validation",
      "Unexpected validation error occurred",
      rawParams
    );
  }
}

export function validatePagination(params: { first?: number; skip?: number }): void {
  const { first, skip } = params;

  if (first !== undefined) {
    if (!Number.isInteger(first) || first < 1 || first > 1000) {
      throw new InvalidParametersError("first", "Must be an integer between 1 and 1000", first);
    }
  }

  if (skip !== undefined) {
    if (!Number.isInteger(skip) || skip < 0) {
      throw new InvalidParametersError("skip", "Must be a non-negative integer", skip);
    }
  }
}

export function validateOrdering(
  params: { orderBy?: string; orderDirection?: string },
  validOrderByFields: string[]
): void {
  const { orderBy, orderDirection } = params;

  if (orderBy !== undefined && !validOrderByFields.includes(orderBy)) {
    throw new InvalidParametersError(
      "orderBy",
      `Must be one of: ${validOrderByFields.join(", ")}`,
      orderBy
    );
  }

  if (orderDirection !== undefined && !["asc", "desc"].includes(orderDirection)) {
    throw new InvalidParametersError(
      "orderDirection",
      'Must be either "asc" or "desc"',
      orderDirection
    );
  }
}

export function validateEthereumAddress(address: string, fieldName: string = "address"): void {
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw new InvalidParametersError(
      fieldName,
      "Invalid Ethereum address format (must be 0x followed by 40 hex characters)",
      address
    );
  }
}

export function validateBigIntString(value: string, fieldName: string): void {
  if (!/^[0-9]+$/.test(value)) {
    throw new InvalidParametersError(
      fieldName,
      "Invalid BigInt format (must contain only numeric digits)",
      value
    );
  }
}

export function validateTimestamp(timestamp: number, fieldName: string): void {
  if (!Number.isInteger(timestamp) || timestamp < 0) {
    throw new InvalidParametersError(
      fieldName,
      "Must be a non-negative integer (Unix timestamp)",
      timestamp
    );
  }
}

export function getValidationSchema(toolName: string): JSONSchema7 | null {
  return getToolSchema(toolName);
}

export function getValidatedTools(): string[] {
  return Object.keys(toolSchemas);
}

import { toolSchemas } from "../schemas/tool-schemas.js";
export { toolSchemas };
