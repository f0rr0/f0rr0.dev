import fs from "node:fs";
import path from "node:path";
import { visit } from "unist-util-visit";

const EXTERNAL_PROTOCOL_PATTERN = /^(https?:)?\/\//i;
const DATA_URL_PATTERN = /^data:/i;
const MAILTO_PATTERN = /^mailto:/i;
const BACKSLASH_PATTERN = /\\/g;
const LEADING_SLASH_PATTERN = /^\/+/;
const DEFAULT_OG_IMAGE_NAMES = [
  "opengraph-image.png",
  "opengraph-image.jpg",
  "opengraph-image.jpeg",
  "opengraph-image.webp",
  "opengraph-image.avif",
  "og.png",
  "og.jpg",
  "og.jpeg",
  "og.webp",
  "og.avif",
];
const DEFAULT_TWITTER_IMAGE_NAMES = [
  "twitter-image.png",
  "twitter-image.jpg",
  "twitter-image.jpeg",
  "twitter-image.webp",
  "twitter-image.avif",
  "twitter-card.png",
  "twitter-card.jpg",
  "twitter-card.jpeg",
  "twitter-card.webp",
  "twitter-card.avif",
];

const isTransformableUrl = (url) => {
  if (!url) return false;
  if (EXTERNAL_PROTOCOL_PATTERN.test(url)) return false;
  if (DATA_URL_PATTERN.test(url)) return false;
  if (MAILTO_PATTERN.test(url)) return false;
  return true;
};

const normaliseImportPath = (url) => {
  if (LEADING_SLASH_PATTERN.test(url)) {
    return `@/../public${url}`;
  }
  return url.replace(BACKSLASH_PATTERN, "/");
};

const toSafeIdentifier = (importPath, index) => {
  const baseName =
    importPath.split("/").filter(Boolean).pop()?.replace(/\W+/g, "_") ??
    "image";
  return `__mdxImage_${baseName || "image"}_${index}`;
};

const createImportNode = (identifier, importPath) => ({
  type: "mdxjsEsm",
  value: `import ${identifier} from '${importPath}';`,
  data: {
    estree: {
      type: "Program",
      sourceType: "module",
      body: [
        {
          type: "ImportDeclaration",
          specifiers: [
            {
              type: "ImportDefaultSpecifier",
              local: { type: "Identifier", name: identifier },
            },
          ],
          source: {
            type: "Literal",
            value: importPath,
            raw: `'${importPath}'`,
          },
        },
      ],
    },
  },
});

const createIdentifierExpression = (identifier) => ({
  type: "mdxJsxAttributeValueExpression",
  value: identifier,
  data: {
    estree: {
      type: "Program",
      sourceType: "module",
      body: [
        {
          type: "ExpressionStatement",
          expression: { type: "Identifier", name: identifier },
        },
      ],
    },
  },
});

const createJsxNode = (identifier, node) => {
  const attributes = [
    {
      type: "mdxJsxAttribute",
      name: "src",
      value: createIdentifierExpression(identifier),
    },
    {
      type: "mdxJsxAttribute",
      name: "alt",
      value: node.alt ?? "",
    },
  ];

  if (node.title) {
    attributes.push({
      type: "mdxJsxAttribute",
      name: "title",
      value: node.title,
    });
  }

  return {
    type: "mdxJsxTextElement",
    name: "img",
    attributes,
    children: [],
  };
};

const getOrCreateImport = (imports, importAliases, importPath, counterRef) => {
  let identifier = importAliases.get(importPath);
  if (!identifier) {
    identifier = toSafeIdentifier(importPath, counterRef.value++);
    importAliases.set(importPath, identifier);
    imports.push(createImportNode(identifier, importPath));
  }
  return identifier;
};

const getAttribute = (node, name) =>
  node.attributes?.find(
    (attribute) =>
      attribute &&
      attribute.type === "mdxJsxAttribute" &&
      attribute.name === name,
  );

const getAttributeStringValue = (attribute) =>
  typeof attribute?.value === "string" ? attribute.value : null;

const transformJsxImage = (node, imports, importAliases, counterRef) => {
  if (!node || !node.name || (node.name !== "img" && node.name !== "Image"))
    return;

  const srcAttribute = getAttribute(node, "src");
  const srcValue = getAttributeStringValue(srcAttribute);
  if (!srcValue || !isTransformableUrl(srcValue)) return;

  const importPath = normaliseImportPath(srcValue);
  const identifier = getOrCreateImport(
    imports,
    importAliases,
    importPath,
    counterRef,
  );

  srcAttribute.value = createIdentifierExpression(identifier);
};

const getPropertyName = (property) => {
  if (!property || property.type !== "Property") return null;
  if (property.key?.type === "Identifier") return property.key.name;
  if (property.key?.type === "Literal") return property.key.value;
  return null;
};

const transformMetadataImage = (
  node,
  imports,
  importAliases,
  counterRef,
  defaultMetadataImage,
  defaultTwitterImage,
) => {
  const program = node?.data?.estree;
  if (!program || !Array.isArray(program.body)) return;

  for (const statement of program.body) {
    if (
      statement.type !== "ExportNamedDeclaration" ||
      statement.declaration?.type !== "VariableDeclaration"
    ) {
      continue;
    }

    for (const declaration of statement.declaration.declarations ?? []) {
      if (declaration.id?.type !== "Identifier") continue;
      if (declaration.id.name !== "metadata") continue;
      if (declaration.init?.type !== "ObjectExpression") continue;

      const properties = declaration.init.properties ?? [];
      let hasImageProperty = false;
      let hasTwitterProperty = false;

      for (const property of properties) {
        const propertyName = getPropertyName(property);
        if (propertyName === "image") {
          hasImageProperty = true;
        }
        if (propertyName === "twitterImage") {
          hasTwitterProperty = true;
        }
        if (propertyName !== "image" && propertyName !== "twitterImage")
          continue;

        if (property.value?.type !== "Literal") continue;
        if (typeof property.value.value !== "string") continue;

        const url = property.value.value;
        if (!isTransformableUrl(url)) continue;

        const importPath = normaliseImportPath(url);
        const identifier = getOrCreateImport(
          imports,
          importAliases,
          importPath,
          counterRef,
        );

        property.value = { type: "Identifier", name: identifier };
      }

      if (!hasImageProperty && defaultMetadataImage) {
        const importPath = normaliseImportPath(defaultMetadataImage);
        const identifier = getOrCreateImport(
          imports,
          importAliases,
          importPath,
          counterRef,
        );

        properties.push({
          type: "Property",
          key: { type: "Identifier", name: "image" },
          value: { type: "Identifier", name: identifier },
          kind: "init",
          method: false,
          shorthand: false,
          computed: false,
        });
      }

      if (!hasTwitterProperty && defaultTwitterImage) {
        const importPath = normaliseImportPath(defaultTwitterImage);
        const identifier = getOrCreateImport(
          imports,
          importAliases,
          importPath,
          counterRef,
        );

        properties.push({
          type: "Property",
          key: { type: "Identifier", name: "twitterImage" },
          value: { type: "Identifier", name: identifier },
          kind: "init",
          method: false,
          shorthand: false,
          computed: false,
        });
      }
    }
  }
};

const findDefaultMetadataImage = (filePath) => {
  if (!filePath || typeof filePath !== "string") return null;
  const dir = path.dirname(filePath);

  for (const filename of DEFAULT_OG_IMAGE_NAMES) {
    const candidate = path.join(dir, filename);
    if (fs.existsSync(candidate)) {
      return `./${filename}`;
    }
  }

  return null;
};

const findDefaultTwitterImage = (filePath) => {
  if (!filePath || typeof filePath !== "string") return null;
  const dir = path.dirname(filePath);

  for (const filename of DEFAULT_TWITTER_IMAGE_NAMES) {
    const candidate = path.join(dir, filename);
    if (fs.existsSync(candidate)) {
      return `./${filename}`;
    }
  }

  return null;
};

const remarkStaticImageImports = () => (tree, file) => {
  const imports = [];
  const importAliases = new Map();
  const counterRef = { value: 0 };
  const defaultMetadataImage = findDefaultMetadataImage(file?.path);
  const defaultTwitterImage = findDefaultTwitterImage(file?.path);

  visit(tree, "image", (node, index, parent) => {
    if (!parent || typeof index !== "number") return;

    const url = node.url ?? "";
    if (!isTransformableUrl(url)) return;

    const importPath = normaliseImportPath(url);
    const identifier = getOrCreateImport(
      imports,
      importAliases,
      importPath,
      counterRef,
    );

    parent.children[index] = createJsxNode(identifier, node);
  });

  visit(tree, "mdxJsxFlowElement", (node) => {
    transformJsxImage(node, imports, importAliases, counterRef);
  });

  visit(tree, "mdxJsxTextElement", (node) => {
    transformJsxImage(node, imports, importAliases, counterRef);
  });

  visit(tree, "mdxjsEsm", (node) => {
    transformMetadataImage(
      node,
      imports,
      importAliases,
      counterRef,
      defaultMetadataImage,
      defaultTwitterImage,
    );
  });

  if (imports.length > 0 && Array.isArray(tree.children)) {
    tree.children = [...imports, ...tree.children];
  }
};

export default remarkStaticImageImports;
