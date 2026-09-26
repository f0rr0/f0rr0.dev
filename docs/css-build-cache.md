# CSS compilation and persistent caches

The typography update exposed stale compiled CSS in a local production build:
`globals.css` specified `--text-sm--line-height: calc(20 / 14)`, but the emitted
`.text-sm` rule still used the previous `1.5rem`. A clean compilation emitted the
correct value. Earlier Vercel previews similarly retained the previous sans font
until redeployed without their build cache. This is evidence of stale compiler
output, not a reason to change browser asset caching or application data caches.
The exact upstream invalidation defect has not been isolated; a subsequent warm
build correctly handled another theme edit, so the failure is intermittent.

## Prevention

We explicitly disable `experimental.turbopackFileSystemCacheForBuild` and
`experimental.turbopackFileSystemCacheForDev` in `next.config.ts`. These are the
[documented Next.js opt-outs](https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopackFileSystemCache).
Next.js 16.3 enabled the build cache by default; development caching has been on
by default since 16.1. The installed 16.3.4 documentation and defaults confirm both.
This bypasses persisted compiler output on local restarts and deployment builds,
while retaining Vercel's dependency cache and normal immutable asset caching.
The tradeoff is more compilation work at startup and build time.

Treat the cache opt-out as a mitigation, not a claim to fix every CSS problem.
Re-enable it only after verifying an upstream fix with consecutive builds and
the served preview CSS. A CSS change during a running dev session still needs
normal HMR verification because these flags control persistence between runs.

## Preview verification and recovery

Check the deployment for the expected commit, fetch a page and the CSS URLs it
actually references, and inspect those rules or their computed browser styles.
A green build alone does not prove the styles are current.

For recovery, Vercel documents redeploying with **Use existing Build Cache**
unchecked, or setting `VERCEL_FORCE_NO_BUILD_CACHE=1` to skip cache restoration.
That broader setting is unnecessary while the compiler-specific opt-out works.
See [Vercel's build-cache guidance](https://vercel.com/docs/deployments/troubleshoot-a-build#managing-build-cache).
