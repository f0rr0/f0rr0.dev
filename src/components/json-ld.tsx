import type { Graph, Thing, WithContext } from "schema-dts";

export type JsonLdData =
  | Graph
  | WithContext<Thing>
  | (Graph | WithContext<Thing>)[];

const serializeJsonLd = (data: JsonLdData) =>
  JSON.stringify(data).replaceAll("<", "\\u003c");

export function JsonLd({ data }: Readonly<{ data: JsonLdData }>) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
