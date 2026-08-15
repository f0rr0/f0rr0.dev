import { defineSchedule } from "eve/schedules";

export default defineSchedule({
  cron: "7 4 * * *",
  markdown:
    "Build and publish today's rolling work-timeline edition from the sanitized activity digest. Follow the required editorial workflow and finish only after publish_timeline succeeds.",
});
