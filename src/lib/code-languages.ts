const LANGUAGE_ICON_BASE_URL =
  "https://cdn.jsdelivr.net/gh/vscode-icons/vscode-icons@v12.19.0/icons";

interface CodeLanguage {
  icon: string;
  name: string;
}

const codeLanguages: Record<string, CodeLanguage> = {
  bash: { icon: "file_type_shell.svg", name: "Bash" },
  c: { icon: "file_type_c.svg", name: "C" },
  cpp: { icon: "file_type_cpp.svg", name: "C++" },
  cs: { icon: "file_type_csharp.svg", name: "C#" },
  csharp: { icon: "file_type_csharp.svg", name: "C#" },
  css: { icon: "file_type_css.svg", name: "CSS" },
  diff: { icon: "file_type_diff.svg", name: "Diff" },
  docker: { icon: "file_type_docker.svg", name: "Docker" },
  dockerfile: { icon: "file_type_docker.svg", name: "Dockerfile" },
  gn: { icon: "file_type_gnu.svg", name: "GN" },
  go: { icon: "file_type_go.svg", name: "Go" },
  graphql: { icon: "file_type_graphql.svg", name: "GraphQL" },
  html: { icon: "file_type_html.svg", name: "HTML" },
  java: { icon: "file_type_java.svg", name: "Java" },
  javascript: { icon: "file_type_js.svg", name: "JavaScript" },
  js: { icon: "file_type_js.svg", name: "JavaScript" },
  json: { icon: "file_type_json.svg", name: "JSON" },
  jsonc: { icon: "file_type_json.svg", name: "JSON with comments" },
  jsx: { icon: "file_type_reactjs.svg", name: "JSX" },
  kotlin: { icon: "file_type_kotlin.svg", name: "Kotlin" },
  lua: { icon: "file_type_lua.svg", name: "Lua" },
  make: { icon: "file_type_gnu.svg", name: "Makefile" },
  markdown: { icon: "file_type_markdown.svg", name: "Markdown" },
  md: { icon: "file_type_markdown.svg", name: "Markdown" },
  mdx: { icon: "file_type_mdx.svg", name: "MDX" },
  php: { icon: "file_type_php.svg", name: "PHP" },
  plaintext: { icon: "file_type_text.svg", name: "Plain text" },
  prisma: { icon: "file_type_prisma.svg", name: "Prisma" },
  proto: { icon: "file_type_protobuf.svg", name: "Protocol Buffers" },
  protobuf: { icon: "file_type_protobuf.svg", name: "Protocol Buffers" },
  py: { icon: "file_type_python.svg", name: "Python" },
  python: { icon: "file_type_python.svg", name: "Python" },
  regex: { icon: "file_type_text.svg", name: "Regular expression" },
  rs: { icon: "file_type_rust.svg", name: "Rust" },
  ruby: { icon: "file_type_ruby.svg", name: "Ruby" },
  rust: { icon: "file_type_rust.svg", name: "Rust" },
  scss: { icon: "file_type_scss.svg", name: "SCSS" },
  sh: { icon: "file_type_shell.svg", name: "Shell" },
  shell: { icon: "file_type_shell.svg", name: "Shell" },
  sql: { icon: "file_type_sql.svg", name: "SQL" },
  swift: { icon: "file_type_swift.svg", name: "Swift" },
  text: { icon: "file_type_text.svg", name: "Plain text" },
  toml: { icon: "file_type_toml.svg", name: "TOML" },
  ts: { icon: "file_type_typescript.svg", name: "TypeScript" },
  tsx: { icon: "file_type_reactts.svg", name: "TSX" },
  txt: { icon: "file_type_text.svg", name: "Plain text" },
  typescript: { icon: "file_type_typescript.svg", name: "TypeScript" },
  vue: { icon: "file_type_vue.svg", name: "Vue" },
  xml: { icon: "file_type_xml.svg", name: "XML" },
  yaml: { icon: "file_type_yaml.svg", name: "YAML" },
  yml: { icon: "file_type_yaml.svg", name: "YAML" },
  zsh: { icon: "file_type_shell.svg", name: "Zsh" },
};

function normalizeLanguage(language: string): string {
  return language.toLowerCase();
}

export function getCodeLanguageIconUrl(language: string): string {
  const icon = codeLanguages[normalizeLanguage(language)]?.icon;
  return `${LANGUAGE_ICON_BASE_URL}/${icon ?? "default_file.svg"}`;
}

export function getCodeLanguageName(language: string): string {
  const normalizedLanguage = normalizeLanguage(language);
  const knownName = codeLanguages[normalizedLanguage]?.name;

  if (knownName !== undefined) {
    return knownName;
  }

  if (normalizedLanguage.length <= 4) {
    return normalizedLanguage.toUpperCase();
  }

  return normalizedLanguage
    .split(/[-_]/u)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}
