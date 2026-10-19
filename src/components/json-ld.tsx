import type { Graph, Thing, WithContext } from "schema-dts";

export type JsonLdData =
  | Graph
  | WithContext<Thing>
  | (Graph | WithContext<Thing>)[];

const serializeJsonLd = (data: JsonLdData) =>
  JSON.stringify(data).replaceAll("<", "\\u003c");

export const JsonLd = ({ data }: Readonly<{ data: JsonLdData }>) => (
  <script type="application/ld+json">{serializeJsonLd(data)}</script>
);
