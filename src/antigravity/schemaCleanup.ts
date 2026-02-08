/**
 * Performs simple cleanup for Gemini models by removing unsupported JSON Schema properties.
 * 
 * @param schema The JSON schema to clean.
 * @returns The cleaned JSON schema.
 */
export function cleanJsonSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const cleaned = { ...schema };
  const unsupported = [
    'minLength', 'maxLength', 'pattern', 'format',
    'examples', 'default', 'strict', '$schema', 'additionalProperties',
  ];

  for (const key of unsupported) {
    delete cleaned[key];
  }

  if (cleaned.properties && typeof cleaned.properties === 'object') {
    const props = cleaned.properties as Record<string, Record<string, unknown>>;
    for (const key in props) {
      props[key] = cleanJsonSchema(props[key]);
    }
  }

  if (cleaned.items && typeof cleaned.items === 'object') {
    cleaned.items = cleanJsonSchema(cleaned.items as Record<string, unknown>);
  }

  return cleaned;
}

const UNSUPPORTED_CONSTRAINTS = [
  'minLength', 'maxLength', 'exclusiveMinimum', 'exclusiveMaximum',
  'pattern', 'minItems', 'maxItems', 'format', 'default', 'examples',
] as const;

const UNSUPPORTED_KEYWORDS = [
  ...UNSUPPORTED_CONSTRAINTS,
  '$schema', '$defs', 'definitions', 'const', '$ref',
  'additionalProperties', 'propertyNames', 'title', '$id', '$comment',
] as const;

/**
 * Appends a hint to the schema description.
 * 
 * @param schema The schema to modify.
 * @param hint The hint to append.
 * @returns The modified schema.
 */
function appendHint(schema: any, hint: string): any {
  if (!schema || typeof schema !== 'object') return schema;
  const existing = typeof schema.description === 'string' ? schema.description : '';
  return { ...schema, description: existing ? `${existing} (${hint})` : hint };
}

/**
 * Converts JSON Schema references to descriptive hints.
 * 
 * @param schema The schema to process.
 * @returns The processed schema with references converted to hints.
 */
function convertRefsToHints(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) return schema.map(convertRefsToHints);

  if (typeof schema.$ref === 'string') {
    const defName = schema.$ref.includes('/') ? schema.$ref.split('/').pop() : schema.$ref;
    const desc = typeof schema.description === 'string' ? schema.description : '';
    const hint = `See: ${defName}`;
    return { type: 'object', description: desc ? `${desc} (${hint})` : hint };
  }

  const result: any = {};
  for (const [key, value] of Object.entries(schema)) {
    result[key] = convertRefsToHints(value);
  }
  return result;
}

/**
 * Converts constant values to single-value enums.
 * 
 * @param schema The schema to process.
 * @returns The processed schema with constants converted to enums.
 */
function convertConstToEnum(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) return schema.map(convertConstToEnum);

  const result: any = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === 'const' && !schema.enum) {
      result.enum = [value];
    } else {
      result[key] = convertConstToEnum(value);
    }
  }
  return result;
}

/**
 * Adds hints for enum values to the description.
 * 
 * @param schema The schema to process.
 * @returns The processed schema with enum hints.
 */
function addEnumHints(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) return schema.map(addEnumHints);

  let result: any = { ...schema };
  if (Array.isArray(result.enum) && result.enum.length > 1 && result.enum.length <= 10) {
    result = appendHint(result, `Allowed: ${result.enum.map(String).join(', ')}`);
  }
  for (const [key, value] of Object.entries(result)) {
    if (key !== 'enum' && typeof value === 'object' && value !== null) {
      result[key] = addEnumHints(value);
    }
  }
  return result;
}

/**
 * Adds hints about additional properties being disallowed.
 * 
 * @param schema The schema to process.
 * @returns The processed schema with additional properties hints.
 */
function addAdditionalPropertiesHints(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) return schema.map(addAdditionalPropertiesHints);

  let result: any = { ...schema };
  if (result.additionalProperties === false) {
    result = appendHint(result, 'No extra properties allowed');
  }
  for (const [key, value] of Object.entries(result)) {
    if (key !== 'additionalProperties' && typeof value === 'object' && value !== null) {
      result[key] = addAdditionalPropertiesHints(value);
    }
  }
  return result;
}

/**
 * Moves unsupported constraints into the description field as hints.
 * 
 * @param schema The schema to process.
 * @returns The processed schema with constraints moved to description.
 */
function moveConstraintsToDescription(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) return schema.map(moveConstraintsToDescription);

  let result: any = { ...schema };
  for (const constraint of UNSUPPORTED_CONSTRAINTS) {
    if (result[constraint] !== undefined && typeof result[constraint] !== 'object') {
      result = appendHint(result, `${constraint}: ${result[constraint]}`);
    }
  }
  for (const [key, value] of Object.entries(result)) {
    if (typeof value === 'object' && value !== null) {
      result[key] = moveConstraintsToDescription(value);
    }
  }
  return result;
}

/**
 * Merges allOf schemas into a single schema.
 * 
 * @param schema The schema to process.
 * @returns The processed schema with allOf merged.
 */
function mergeAllOf(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) return schema.map(mergeAllOf);

  let result: any = { ...schema };

  if (Array.isArray(result.allOf)) {
    const merged: any = {};
    const mergedRequired: string[] = [];

    for (const item of result.allOf) {
      if (!item || typeof item !== 'object') continue;
      if (item.properties) merged.properties = { ...merged.properties, ...item.properties };
      if (Array.isArray(item.required)) {
        for (const r of item.required) {
          if (!mergedRequired.includes(r)) mergedRequired.push(r);
        }
      }
      for (const [k, v] of Object.entries(item)) {
        if (k !== 'properties' && k !== 'required' && merged[k] === undefined) merged[k] = v;
      }
    }

    if (merged.properties) result.properties = { ...result.properties, ...merged.properties };
    if (mergedRequired.length > 0) {
      result.required = Array.from(new Set([...(result.required || []), ...mergedRequired]));
    }
    for (const [k, v] of Object.entries(merged)) {
      if (k !== 'properties' && k !== 'required' && result[k] === undefined) result[k] = v;
    }
    delete result.allOf;
  }

  for (const [key, value] of Object.entries(result)) {
    if (typeof value === 'object' && value !== null) result[key] = mergeAllOf(value);
  }
  return result;
}

/**
 * Scores a schema option based on its complexity.
 * 
 * @param schema The schema option to score.
 * @returns An object containing the score and the type name.
 */
function scoreOption(schema: any): { score: number; typeName: string } {
  if (!schema || typeof schema !== 'object') return { score: 0, typeName: 'unknown' };
  if (schema.type === 'object' || schema.properties) return { score: 3, typeName: 'object' };
  if (schema.type === 'array' || schema.items) return { score: 2, typeName: 'array' };
  if (schema.type && schema.type !== 'null') return { score: 1, typeName: schema.type };
  return { score: 0, typeName: schema.type || 'null' };
}

/**
 * Attempts to merge an enum from a union of schemas.
 * 
 * @param options The array of schema options.
 * @returns The merged enum values or null if not possible.
 */
function tryMergeEnumFromUnion(options: any[]): string[] | null {
  if (!Array.isArray(options) || options.length === 0) return null;
  const vals: string[] = [];
  for (const opt of options) {
    if (!opt || typeof opt !== 'object') return null;
    if (opt.const !== undefined) { vals.push(String(opt.const)); continue; }
    if (Array.isArray(opt.enum)) { vals.push(...opt.enum.map(String)); continue; }
    if (opt.properties || opt.items || opt.anyOf || opt.oneOf || opt.allOf) return null;
    if (opt.type && !opt.const && !opt.enum) return null;
  }
  return vals.length > 0 ? vals : null;
}

/**
 * Flattens anyOf and oneOf schemas by selecting the best option.
 * 
 * @param schema The schema to process.
 * @returns The processed schema with flattened unions.
 */
function flattenAnyOfOneOf(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) return schema.map(flattenAnyOfOneOf);

  let result: any = { ...schema };

  for (const unionKey of ['anyOf', 'oneOf'] as const) {
    if (!Array.isArray(result[unionKey]) || result[unionKey].length === 0) continue;

    const options = result[unionKey];
    const parentDesc = typeof result.description === 'string' ? result.description : '';
    const mergedEnum = tryMergeEnumFromUnion(options);

    if (mergedEnum !== null) {
      const { [unionKey]: _, ...rest } = result;
      result = { ...rest, type: 'string', enum: mergedEnum };
      if (parentDesc) result.description = parentDesc;
      continue;
    }

    let bestIdx = 0, bestScore = -1;
    const allTypes: string[] = [];
    for (let i = 0; i < options.length; i++) {
      const { score, typeName } = scoreOption(options[i]);
      if (typeName) allTypes.push(typeName);
      if (score > bestScore) { bestScore = score; bestIdx = i; }
    }

    let selected = flattenAnyOfOneOf(options[bestIdx]) || { type: 'string' };
    if (parentDesc) {
      const childDesc = typeof selected.description === 'string' ? selected.description : '';
      selected = { ...selected, description: childDesc && childDesc !== parentDesc ? `${parentDesc} (${childDesc})` : parentDesc };
    }
    if (allTypes.length > 1) {
      selected = appendHint(selected, `Accepts: ${[...new Set(allTypes)].join(' | ')}`);
    }

    const { [unionKey]: _, description: __, ...rest } = result;
    result = { ...rest, ...selected };
  }

  for (const [key, value] of Object.entries(result)) {
    if (typeof value === 'object' && value !== null) result[key] = flattenAnyOfOneOf(value);
  }
  return result;
}

/**
 * Flattens type arrays by selecting a primary type and adding hints for others.
 * 
 * @param schema The schema to process.
 * @returns The processed schema with flattened type arrays.
 */
function flattenTypeArrays(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) return schema.map(flattenTypeArrays);

  let result: any = { ...schema };

  if (Array.isArray(result.type)) {
    const types = result.type as string[];
    const hasNull = types.includes('null');
    const nonNull = types.filter((t: string) => t !== 'null' && t);
    result.type = nonNull.length > 0 ? nonNull[0] : 'string';
    if (nonNull.length > 1) result = appendHint(result, `Accepts: ${nonNull.join(' | ')}`);
    if (hasNull) result = appendHint(result, 'nullable');
  }

  for (const [key, value] of Object.entries(result)) {
    if (typeof value === 'object' && value !== null) result[key] = flattenTypeArrays(value);
  }
  return result;
}

/**
 * Removes unsupported keywords from the schema.
 * 
 * @param schema The schema to process.
 * @param insideProperties Whether the current level is inside a properties object.
 * @returns The processed schema with unsupported keywords removed.
 */
function removeUnsupportedKeywords(schema: any, insideProperties = false): any {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) return schema.map((item) => removeUnsupportedKeywords(item, false));

  const result: any = {};
  for (const [key, value] of Object.entries(schema)) {
    if (!insideProperties && (UNSUPPORTED_KEYWORDS as readonly string[]).includes(key)) continue;
    if (typeof value === 'object' && value !== null) {
      result[key] = key === 'properties'
        ? Object.fromEntries(Object.entries(value as object).map(([k, v]) => [k, removeUnsupportedKeywords(v, false)]))
        : removeUnsupportedKeywords(value, false);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Cleans up the required fields list by ensuring they exist in the properties object.
 * 
 * @param schema The schema to process.
 * @returns The processed schema with cleaned up required fields.
 */
function cleanupRequiredFields(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) return schema.map(cleanupRequiredFields);

  let result: any = { ...schema };
  if (Array.isArray(result.required) && result.properties && typeof result.properties === 'object') {
    const valid = result.required.filter((r: string) => r in result.properties);
    if (valid.length === 0) delete result.required;
    else result.required = valid;
  }
  for (const [key, value] of Object.entries(result)) {
    if (typeof value === 'object' && value !== null) result[key] = cleanupRequiredFields(value);
  }
  return result;
}

/**
 * Adds a placeholder property to empty object schemas.
 * 
 * @param schema The schema to process.
 * @returns The processed schema with a placeholder for empty objects.
 */
function addEmptySchemaPlaceholder(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) return schema.map(addEmptySchemaPlaceholder);

  let result: any = { ...schema };
  if (result.type === 'object') {
    const hasProps = result.properties && typeof result.properties === 'object' && Object.keys(result.properties).length > 0;
    if (!hasProps) {
      result.properties = { _placeholder: { type: 'boolean', description: 'Placeholder for empty schema' } };
      result.required = ['_placeholder'];
    }
  }
  for (const [key, value] of Object.entries(result)) {
    if (typeof value === 'object' && value !== null) result[key] = addEmptySchemaPlaceholder(value);
  }
  return result;
}

/**
 * Full cleanup pipeline for Claude VALIDATED mode.
 * Transforms unsupported features into description hints.
 * 
 * @param schema The schema to clean.
 * @returns The cleaned schema compatible with Antigravity Claude models.
 */
export function cleanJSONSchemaForAntigravity(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema;

  let result = schema;
  result = convertRefsToHints(result);
  result = convertConstToEnum(result);
  result = addEnumHints(result);
  result = addAdditionalPropertiesHints(result);
  result = moveConstraintsToDescription(result);
  result = mergeAllOf(result);
  result = flattenAnyOfOneOf(result);
  result = flattenTypeArrays(result);
  result = removeUnsupportedKeywords(result);
  result = cleanupRequiredFields(result);
  result = addEmptySchemaPlaceholder(result);
  return result;
}
