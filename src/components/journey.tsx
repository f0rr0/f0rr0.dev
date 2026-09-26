"use client";

import { FoldVertical, UnfoldVertical } from "lucide-react";
import {
  animate,
  AnimatePresence,
  motion,
  MotionConfig,
  LayoutGroup,
  useReducedMotion,
  useMotionValue,
} from "motion/react";
import { useId, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import {
  TooltipContent,
  TooltipGroup,
  TooltipTrigger,
} from "@/components/site-tooltip";
import { Badge } from "@/components/ui/badge";
import {
  resumeCompanyStageLabels,
  resumeRoleMarkerLabels,
} from "@/content/resume";
import type { LogoAsset, ResumeExperience, ResumeRole } from "@/content/resume";
import { track } from "@/lib/analytics";

const layoutTransition = {
  type: "spring",
  visualDuration: 0.24,
  bounce: 0,
} as const;
const revealEase = [0.23, 1, 0.32, 1] as const;

// Exit in place while the persistent labels move to their new positions.
function JourneyReveal({
  expanded,
  children,
  className,
  delay = 0.18,
  inline = false,
}: Readonly<{
  expanded: boolean;
  children: ReactNode;
  className?: string;
  delay?: number;
  inline?: boolean;
}>) {
  const reducedMotion = useReducedMotion() === true;
  const Element = inline ? motion.span : motion.div;
  return (
    <AnimatePresence initial={false} mode="popLayout">
      {expanded ? (
        <Element
          key="detail"
          className={className}
          initial="hidden"
          animate="visible"
          exit="exit"
          variants={{
            hidden: {
              opacity: 0,
              transform: reducedMotion || inline ? "none" : "translateY(6px)",
            },
            visible: {
              opacity: 1,
              transform: reducedMotion || inline ? "none" : "translateY(0px)",
            },
            exit: {
              opacity: 0,
              transform: reducedMotion || inline ? "none" : "translateY(3px)",
              transition: {
                duration: reducedMotion ? 0 : 0.1,
                ease: revealEase,
              },
            },
          }}
          transition={{
            duration: reducedMotion ? 0 : inline ? 0.14 : 0.18,
            delay: reducedMotion ? 0 : delay,
            ease: revealEase,
          }}
        >
          {children}
        </Element>
      ) : null}
    </AnimatePresence>
  );
}

function CompanyLogo({
  logo,
}: Readonly<{
  logo: LogoAsset;
}>) {
  return (
    <div
      className={`flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full shadow-sm ring-1 ring-border ${logo.tileClassName}`}
      aria-hidden="true"
    >
      <img
        alt=""
        className={`object-contain ${logo.imageClassName ?? "h-5 w-7"}`}
        src={logo.src}
      />
    </div>
  );
}

function BulletLogo({
  logo,
}: Readonly<{
  logo: LogoAsset;
}>) {
  return (
    <span
      className={`mt-0.5 flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full ring-1 ring-border ${logo.tileClassName}`}
      aria-hidden="true"
      title={logo.alt}
    >
      <img
        alt=""
        className={`object-contain ${
          logo.bulletImageClassName ?? logo.imageClassName ?? "h-4 w-5"
        }`}
        src={logo.src}
      />
    </span>
  );
}

function RoleMarkers({ role }: Readonly<{ role: ResumeRole }>) {
  return role.markers?.map((marker) => (
    <Badge
      className="h-7 text-sm"
      variant="outline"
      key={marker}
      title={marker === "leadership" ? role.leadershipScope : undefined}
    >
      {resumeRoleMarkerLabels[marker]}
    </Badge>
  ));
}

function RoleBlock({
  role,
  expanded,
}: Readonly<{ role: ResumeRole; expanded: boolean }>) {
  const reducedMotion = useReducedMotion() === true;
  const pointVariants = {
    hidden: {
      opacity: reducedMotion ? 1 : 0,
      transform: reducedMotion ? "none" : "translateY(4px)",
    },
    visible: (index: number) => ({
      opacity: 1,
      transform: reducedMotion ? "none" : "translateY(0px)",
      transition: {
        duration: reducedMotion ? 0 : 0.16,
        delay: reducedMotion ? 0 : 0.16 + Math.min(index, 3) * 0.03,
        ease: revealEase,
      },
    }),
  };
  return (
    <div className="contents [.journey[data-expanded='true']_&]:grid [.journey[data-expanded='true']_&]:grid-cols-1 sm:[.journey[data-expanded='true']_&]:grid-cols-[minmax(0,1fr)_auto] [.journey[data-expanded='true']_&]:items-baseline [.journey[data-expanded='true']_&]:gap-x-2 [.journey[data-expanded='true']_&]:gap-y-1 sm:[.journey[data-expanded='true']_&]:gap-x-4 [.journey[data-expanded='true']_&]:mt-4">
      <motion.div
        layout="position"
        className="sm:[.journey[data-expanded='true']_&]:block sm:[.journey[data-expanded='true']_&]:wrap-anywhere col-2 [.journey[data-expanded='true']_&]:col-1 mt-1 [.journey[data-expanded='true']_&]:mt-0 sm:[.journey[data-expanded='false']_&]:place-self-end sm:[.journey[data-expanded='false']_&]:text-end sm:[.journey[data-expanded='false']_&]:col-3 sm:[.journey[data-expanded='false']_&]:row-1 sm:[.journey[data-expanded='false']_&]:mt-0 relative flex min-w-0 flex-wrap items-center gap-2"
      >
        <motion.span
          layout="position"
          className="font-normal text-foreground max-sm:block max-sm:max-w-full max-sm:shrink-0 max-sm:overflow-x-auto max-sm:whitespace-nowrap"
        >
          {role.title}
        </motion.span>
        <JourneyReveal
          expanded={expanded}
          inline
          className="relative top-[-0.5px] ml-2 inline-flex flex-wrap gap-2 align-baseline empty:hidden max-sm:ml-0 max-sm:flex-nowrap"
          delay={0.12}
        >
          <RoleMarkers role={role} />
        </JourneyReveal>
      </motion.div>
      <motion.p
        layout="position"
        className="col-2 [.journey[data-expanded='true']_&]:col-1 sm:[.journey[data-expanded='true']_&]:col-2 sm:[.journey[data-expanded='true']_&]:row-1 sm:[.journey[data-expanded='true']_&]:text-end [.journey[data-expanded='true']_&]:whitespace-nowrap mt-1 sm:[.journey[data-expanded='false']_&]:justify-self-end sm:[.journey[data-expanded='false']_&]:text-end sm:[.journey[data-expanded='false']_&]:col-3 sm:[.journey[data-expanded='false']_&]:row-2 sm:[.journey[data-expanded='false']_&]:mt-1 relative text-sm text-muted-foreground tabular-nums"
      >
        <JourneyReveal
          expanded={expanded}
          inline
          className="inline-block"
          delay={0.22}
        >
          {role.location} ·&nbsp;
        </JourneyReveal>
        <motion.span layout="position" className="inline-block">
          {role.dates}
        </motion.span>
      </motion.p>
      <JourneyReveal
        expanded={expanded}
        className="col-span-full min-w-0"
        delay={0.12}
      >
        {role.summary === undefined ? null : (
          <p className="mt-2 text-muted-foreground">{role.summary}</p>
        )}
        {role.bullets !== undefined && role.bullets.length > 0 ? (
          <ul className="mt-2 space-y-2 text-muted-foreground">
            {role.bullets.map((bullet, index) => {
              const isTextBullet = typeof bullet === "string";
              const text = isTextBullet ? bullet : bullet.text;
              const label = isTextBullet ? undefined : bullet.label;
              const logo = isTextBullet ? undefined : bullet.logo;

              return (
                <motion.li
                  key={text}
                  custom={index}
                  variants={pointVariants}
                  className={
                    logo === undefined
                      ? "relative pl-4 before:absolute before:left-0 before:text-primary before:content-['·']"
                      : "flex gap-2.5"
                  }
                >
                  {logo === undefined ? (
                    text
                  ) : (
                    <>
                      <BulletLogo logo={logo} />
                      <span>
                        {label === undefined ? null : (
                          <>
                            <span className="font-medium text-foreground">
                              {label}
                            </span>
                            {": "}
                          </>
                        )}
                        {text}
                      </span>
                    </>
                  )}
                </motion.li>
              );
            })}
          </ul>
        ) : null}
      </JourneyReveal>
    </div>
  );
}

function ExperienceItem({
  item,
  expanded,
  onToggle,
}: Readonly<{
  item: ResumeExperience;
  expanded: boolean;
  onToggle: () => void;
}>) {
  const fullName = item.displayName ?? item.company;
  const compactName = item.compactName ?? item.company;
  const company = expanded ? fullName : compactName;
  const entryRef = useRef<HTMLLIElement>(null);
  const companyStage =
    item.companyStage === undefined
      ? undefined
      : resumeCompanyStageLabels[item.companyStage];
  return (
    <motion.li
      ref={entryRef}
      layout="position"
      className="relative [border-bottom:1px_solid_transparent] [transition:border-color_100ms_ease-out] grid grid-cols-[2.5rem_minmax(0,1fr)] items-start gap-x-4 py-3 [.journey[data-expanded='false']_&:not(:last-child)]:[border-bottom-color:var(--border)] [.journey[data-expanded='false']_&:not(:last-child)]:[transition:border-color_140ms_ease-out_200ms] sm:[.journey[data-expanded='false']_&]:grid-cols-[2.5rem_fit-content(45%)_minmax(0,1fr)] motion-reduce:transition-none motion-reduce:[.journey[data-expanded='false']_&:not(:last-child)]:transition-none"
    >
      <motion.div
        layout="position"
        className="col-1 row-[1/span_2] self-start sm:[.journey[data-expanded='false']_&]:self-center [.journey[data-expanded='false']_&]:row-[1/span_3] sm:[.journey[data-expanded='false']_&]:row-[1/span_2]"
      >
        <CompanyLogo logo={item.logo} />
      </motion.div>
      <motion.div
        layout="position"
        className="flex min-h-10 [.journey[data-expanded='true']_&]:min-h-6 [.journey[data-expanded='true']_&]:self-start max-sm:[.journey[data-expanded='false']_&]:min-h-6 items-center self-center col-2 row-1 sm:[.journey[data-expanded='false']_&]:row-[1/span_2] min-w-0"
      >
        <div className="relative flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className="text-foreground">
            <TooltipTrigger
              payload={
                <TooltipContent
                  preview
                  side="left"
                  sideOffset={24}
                  align="start"
                  anchor={entryRef}
                >
                  <p className="font-medium">{fullName}</p>
                  {item.tagline ? (
                    <p className="mt-2 text-muted-foreground">{item.tagline}</p>
                  ) : null}
                  {item.roles.map((role) => {
                    const bullet = role.bullets?.[0];
                    return (
                      <p
                        className="mt-2 text-muted-foreground"
                        key={role.title}
                      >
                        {role.summary ??
                          (typeof bullet === "string"
                            ? bullet
                            : bullet?.text) ??
                          role.title}
                      </p>
                    );
                  })}
                </TooltipContent>
              }
              className="font-medium underline decoration-transparent underline-offset-[0.2em] [transition:text-decoration-color_150ms_ease-out] [:hover,_:focus-visible]:decoration-[currentColor] motion-reduce:transition-none relative block min-h-6 cursor-pointer text-start focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
              onClick={onToggle}
              aria-expanded={expanded}
              aria-label={`${company}: ${expanded ? "hide details" : "show details"}`}
            >
              {fullName === compactName ? (
                company
              ) : (
                <>
                  <JourneyReveal
                    expanded={!expanded}
                    inline
                    delay={0}
                    className="block"
                  >
                    {compactName}
                  </JourneyReveal>
                  <JourneyReveal
                    expanded={expanded}
                    inline
                    delay={0}
                    className="block"
                  >
                    {fullName}
                  </JourneyReveal>
                </>
              )}
            </TooltipTrigger>
          </h3>
          {companyStage === undefined ? null : (
            <JourneyReveal
              expanded={expanded}
              inline
              className="inline-flex"
              delay={0.12}
            >
              <Badge
                className="h-7 text-sm"
                variant="outline"
                title={`Company stage during this role: ${companyStage}`}
              >
                {companyStage}
              </Badge>
            </JourneyReveal>
          )}
        </div>
      </motion.div>
      <JourneyReveal
        expanded={expanded && item.tagline.length > 0}
        className="col-2 mt-1 text-sm text-muted-foreground"
        delay={0.08}
      >
        <p>{item.tagline}</p>
      </JourneyReveal>
      <div className="contents [.journey[data-expanded='true']_&]:block [.journey[data-expanded='true']_&]:col-span-full sm:[.journey[data-expanded='true']_&]:col-2">
        {item.roles.map((role) => (
          <RoleBlock key={role.title} role={role} expanded={expanded} />
        ))}
      </div>
    </motion.li>
  );
}

export function Journey({
  experience,
  education,
  skills,
  action,
}: Readonly<{
  experience: ResumeExperience[];
  education: ResumeExperience[];
  skills: readonly string[];
  action?: React.ReactNode;
}>) {
  const [expanded, setExpanded] = useState(false);
  const DetailsIcon = expanded ? FoldVertical : UnfoldVertical;
  const contentId = useId();
  const contentRef = useRef<HTMLDivElement>(null);
  const height = useMotionValue<number | string>("auto");
  const reducedMotion = useReducedMotion() === true;

  // Keep the footer and the document's scroll limit in step with the entries.
  useLayoutEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      const nextHeight = entry.borderBoxSize[0].blockSize;
      if (reducedMotion || height.get() === "auto") {
        height.stop();
        height.set(nextHeight);
      } else {
        animate(height, nextHeight, layoutTransition);
      }
    });
    const content = contentRef.current;
    if (content !== null) {
      observer.observe(content);
    }
    return () => {
      observer.disconnect();
      height.stop();
    };
  }, [height, reducedMotion]);

  const toggle = () => {
    if (!expanded) {
      track("details_opened", { section: "journey" });
    }
    setExpanded((value) => !value);
  };
  return (
    <MotionConfig
      reducedMotion="user"
      transition={{ layout: layoutTransition }}
    >
      <LayoutGroup>
        <TooltipGroup>
          <section
            className="journey [overflow-anchor:none]"
            id="journey"
            data-expanded={expanded}
            aria-label="Career history"
          >
            <div className="mb-4 flex items-baseline justify-between gap-3">
              <h2 className="font-serif text-xl font-normal text-foreground">
                Experience
              </h2>
              <div className="flex shrink-0 items-center justify-end gap-3">
                {action}
                <button
                  type="button"
                  className="site-text-link inline-flex min-h-11 items-center gap-1.5 rounded-sm text-sm font-normal text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50"
                  aria-expanded={expanded}
                  aria-controls={contentId}
                  onClick={toggle}
                >
                  <DetailsIcon
                    aria-hidden="true"
                    className="size-3.5 shrink-0"
                    strokeWidth={1.5}
                  />
                  Details
                </button>
              </div>
            </div>
            <motion.div style={{ height }}>
              <div
                ref={contentRef}
                id={contentId}
                className="relative flow-root"
              >
                <ol>
                  {experience.map((item) => (
                    <ExperienceItem
                      key={item.company}
                      item={item}
                      expanded={expanded}
                      onToggle={toggle}
                    />
                  ))}
                </ol>
                <motion.div layout="position" className="mt-8">
                  <h2 className="mb-4 font-serif text-xl font-normal text-foreground">
                    Education
                  </h2>
                  <ol className="mt-4">
                    {education.map((item) => (
                      <ExperienceItem
                        key={item.company}
                        item={{
                          ...item,
                          tagline: "",
                          roles: item.roles.map((role) => ({
                            ...role,
                            title: `${item.tagline.replace(/\.$/, "").replace("Bachelor of Science", "B.S.")} — ${role.title}`,
                          })),
                        }}
                        expanded={expanded}
                        onToggle={toggle}
                      />
                    ))}
                  </ol>
                </motion.div>
                <JourneyReveal
                  expanded={expanded}
                  className="mt-8"
                  delay={0.04}
                >
                  <h2 className="mb-4 font-serif text-xl font-normal text-foreground">
                    Skills
                  </h2>
                  <p className="mt-2 text-muted-foreground">
                    {skills.join(" · ")}
                  </p>
                </JourneyReveal>
              </div>
            </motion.div>
          </section>
        </TooltipGroup>
      </LayoutGroup>
    </MotionConfig>
  );
}
