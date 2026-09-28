import { env } from "$env/dynamic/public";

// Read the public environment at runtime so one image can serve production and next.
export const siteUrls = {
  get reader() { return (env.PUBLIC_READER_ORIGIN || "https://tutors.dev").replace(/\/$/, ""); },
  get catalogue() { return (env.PUBLIC_CATALOGUE_ORIGIN || "https://catalogue.tutors.dev").replace(/\/$/, ""); },
  get live() { return (env.PUBLIC_LIVE_ORIGIN || "https://live.tutors.dev").replace(/\/$/, ""); },
  get time() { return (env.PUBLIC_TIME_ORIGIN || "https://time.tutors.dev").replace(/\/$/, ""); }
};
