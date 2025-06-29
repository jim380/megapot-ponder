import {
  type DocumentNode,
  type FieldNode,
  type FragmentDefinitionNode,
  type OperationDefinitionNode,
  type SelectionNode,
  visit,
  type GraphQLSchema,
} from "graphql";
import { getLogger } from "../logging/index.js";

const logger = getLogger("graphql-complexity");

export interface ComplexityConfig {
  scalarCost: number;
  objectCost: number;
  listFactor: number;
  depthFactor: number;
  introspectionCost: number;
  defaultListSize: number;
  fieldCosts?: Record<string, number>;
}

const DEFAULT_CONFIG: ComplexityConfig = {
  scalarCost: 1,
  objectCost: 2,
  listFactor: 10,
  depthFactor: 1.5,
  introspectionCost: 1000,
  defaultListSize: 10,
  fieldCosts: {
    hourlyStats: 50,
    protocolStats: 100,
    lpLeaderboard: 50,
    userLeaderboard: 50,
    lpStats: 25,
    userStats: 25,

    tickets: 20,
    receivedTickets: 20,
    referredTickets: 20,
    withdrawals: 15,
    feeDistributions: 15,
    actions: 15,
    snapshots: 15,
    lpSnapshots: 20,

    users: 10,
    liquidityProviders: 10,
    jackpotRounds: 10,
  },
};

export interface ComplexityResult {
  score: number;
  details: {
    fieldCount: number;
    maxDepth: number;
    listFields: number;
    customCosts: Record<string, number>;
  };
  errors?: string[];
}

export function calculateQueryComplexity(
  document: DocumentNode,
  _schema?: GraphQLSchema,
  config: Partial<ComplexityConfig> = {}
): ComplexityResult {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const result: ComplexityResult = {
    score: 0,
    details: {
      fieldCount: 0,
      maxDepth: 0,
      listFields: 0,
      customCosts: {},
    },
  };

  const fragments = new Map<string, FragmentDefinitionNode>();
  visit(document, {
    FragmentDefinition(node) {
      fragments.set(node.name.value, node);
    },
  });

  visit(document, {
    OperationDefinition(node) {
      if (node.operation === "subscription") {
        result.score += calculateSubscriptionComplexity(node, fragments, mergedConfig);
      } else {
        const operationComplexity = calculateOperationComplexity(node, fragments, mergedConfig);
        result.score += operationComplexity.score;

        result.details.fieldCount += operationComplexity.fieldCount;
        result.details.maxDepth = Math.max(result.details.maxDepth, operationComplexity.maxDepth);
        result.details.listFields += operationComplexity.listFields;

        for (const [field, cost] of Object.entries(operationComplexity.customCosts)) {
          result.details.customCosts[field] = (result.details.customCosts[field] || 0) + cost;
        }
      }
    },
  });

  logger.debug(
    {
      score: result.score,
      details: result.details,
    },
    "Calculated query complexity"
  );

  return result;
}

function calculateOperationComplexity(
  operation: OperationDefinitionNode,
  fragments: Map<string, FragmentDefinitionNode>,
  config: ComplexityConfig
): {
  score: number;
  fieldCount: number;
  maxDepth: number;
  listFields: number;
  customCosts: Record<string, number>;
} {
  let score = 0;
  let fieldCount = 0;
  let maxDepth = 0;
  let listFields = 0;
  const customCosts: Record<string, number> = {};

  const hasIntrospection = operation.selectionSet.selections.some(
    (selection) =>
      selection.kind === "Field" &&
      (selection.name.value === "__schema" || selection.name.value === "__type")
  );

  if (hasIntrospection) {
    score += config.introspectionCost;
    customCosts["__introspection"] = config.introspectionCost;
  }

  const selectionComplexity = calculateSelectionSetComplexity(
    operation.selectionSet.selections,
    fragments,
    config,
    1
  );

  score += selectionComplexity.score;
  fieldCount += selectionComplexity.fieldCount;
  maxDepth = selectionComplexity.maxDepth;
  listFields += selectionComplexity.listFields;

  for (const [field, cost] of Object.entries(selectionComplexity.customCosts)) {
    customCosts[field] = (customCosts[field] || 0) + cost;
  }

  return { score, fieldCount, maxDepth, listFields, customCosts };
}

function calculateSelectionSetComplexity(
  selections: ReadonlyArray<SelectionNode>,
  fragments: Map<string, FragmentDefinitionNode>,
  config: ComplexityConfig,
  depth: number
): {
  score: number;
  fieldCount: number;
  maxDepth: number;
  listFields: number;
  customCosts: Record<string, number>;
} {
  let score = 0;
  let fieldCount = 0;
  let maxDepth = depth;
  let listFields = 0;
  const customCosts: Record<string, number> = {};

  for (const selection of selections) {
    if (selection.kind === "Field") {
      fieldCount++;

      const fieldName = selection.name.value;
      const hasSelections = selection.selectionSet && selection.selectionSet.selections.length > 0;

      if (config.fieldCosts && config.fieldCosts[fieldName]) {
        const customCost = config.fieldCosts[fieldName];
        score += customCost;
        customCosts[fieldName] = (customCosts[fieldName] || 0) + customCost;
      } else {
        score += hasSelections ? config.objectCost : config.scalarCost;
      }

      score *= Math.pow(config.depthFactor, depth - 1);

      const isList = isListField(selection);
      if (isList) {
        listFields++;
        const listSize = getListSize(selection, config.defaultListSize);
        score *= config.listFactor * (listSize / config.defaultListSize);
      }

      if (hasSelections && selection.selectionSet) {
        const nestedComplexity = calculateSelectionSetComplexity(
          selection.selectionSet.selections,
          fragments,
          config,
          depth + 1
        );

        score += nestedComplexity.score;
        fieldCount += nestedComplexity.fieldCount;
        maxDepth = Math.max(maxDepth, nestedComplexity.maxDepth);
        listFields += nestedComplexity.listFields;

        for (const [field, cost] of Object.entries(nestedComplexity.customCosts)) {
          customCosts[field] = (customCosts[field] || 0) + cost;
        }
      }
    } else if (selection.kind === "FragmentSpread") {
      const fragment = fragments.get(selection.name.value);
      if (fragment) {
        const fragmentComplexity = calculateSelectionSetComplexity(
          fragment.selectionSet.selections,
          fragments,
          config,
          depth
        );

        score += fragmentComplexity.score;
        fieldCount += fragmentComplexity.fieldCount;
        maxDepth = Math.max(maxDepth, fragmentComplexity.maxDepth);
        listFields += fragmentComplexity.listFields;

        for (const [field, cost] of Object.entries(fragmentComplexity.customCosts)) {
          customCosts[field] = (customCosts[field] || 0) + cost;
        }
      }
    } else if (selection.kind === "InlineFragment") {
      const inlineComplexity = calculateSelectionSetComplexity(
        selection.selectionSet.selections,
        fragments,
        config,
        depth
      );

      score += inlineComplexity.score;
      fieldCount += inlineComplexity.fieldCount;
      maxDepth = Math.max(maxDepth, inlineComplexity.maxDepth);
      listFields += inlineComplexity.listFields;

      for (const [field, cost] of Object.entries(inlineComplexity.customCosts)) {
        customCosts[field] = (customCosts[field] || 0) + cost;
      }
    }
  }

  return { score, fieldCount, maxDepth, listFields, customCosts };
}

function calculateSubscriptionComplexity(
  operation: OperationDefinitionNode,
  fragments: Map<string, FragmentDefinitionNode>,
  config: ComplexityConfig
): number {
  let score = 50;

  const selectionComplexity = calculateSelectionSetComplexity(
    operation.selectionSet.selections,
    fragments,
    config,
    1
  );

  score += selectionComplexity.score * 2;

  return score;
}

function isListField(field: FieldNode): boolean {
  const fieldName = field.name.value;
  const hasListArguments = field.arguments?.some(
    (arg) => arg.name.value === "first" || arg.name.value === "last" || arg.name.value === "limit"
  );

  return (
    hasListArguments ||
    fieldName.endsWith("s") ||
    fieldName.includes("List") ||
    fieldName.includes("leaderboard") ||
    fieldName === "hourlyStats"
  );
}

function getListSize(field: FieldNode, defaultSize: number): number {
  if (!field.arguments) return defaultSize;

  for (const arg of field.arguments) {
    if (arg.name.value === "first" || arg.name.value === "last" || arg.name.value === "limit") {
      if (arg.value.kind === "IntValue") {
        return parseInt(arg.value.value, 10);
      }
    }
  }

  return defaultSize;
}

export function validateQueryComplexity(
  document: DocumentNode,
  maxComplexity: number,
  schema?: GraphQLSchema,
  config?: Partial<ComplexityConfig>
): { valid: boolean; complexity: ComplexityResult; message?: string } {
  const complexity = calculateQueryComplexity(document, schema, config);

  if (complexity.score > maxComplexity) {
    const message =
      `Query complexity ${complexity.score} exceeds maximum allowed complexity ${maxComplexity}. ` +
      `Consider reducing the number of fields (${complexity.details.fieldCount}), ` +
      `query depth (${complexity.details.maxDepth}), or list fields (${complexity.details.listFields}).`;

    logger.warn(
      {
        complexity: complexity.score,
        maxComplexity,
        details: complexity.details,
      },
      "Query complexity exceeded"
    );

    return { valid: false, complexity, message };
  }

  return { valid: true, complexity };
}

export function createComplexityError(complexity: ComplexityResult, maxComplexity: number): string {
  const suggestions: string[] = [];

  if (complexity.details.maxDepth > 5) {
    suggestions.push("Reduce query depth by selecting fewer nested fields");
  }

  if (complexity.details.listFields > 3) {
    suggestions.push("Limit the number of list fields or use pagination arguments (first/last)");
  }

  const expensiveFields = Object.entries(complexity.details.customCosts)
    .filter(([_, cost]) => cost > 50)
    .map(([field]) => field);

  if (expensiveFields.length > 0) {
    suggestions.push(`Consider removing expensive fields: ${expensiveFields.join(", ")}`);
  }

  return (
    `Query too complex (score: ${complexity.score}, limit: ${maxComplexity}). ` +
    suggestions.join(" ")
  );
}
