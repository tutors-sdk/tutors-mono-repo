import type { CardStyleType } from "../types.ts";

type CardStyles = Record<CardStyleType, string>;

export interface CardStyleConfig {
  heading: CardStyles;
  dimensions: CardStyles;
  image: CardStyles;
  icon: CardStyles;
  iconHeight: CardStyles;
  text: CardStyles;
  avatar: CardStyles;
  container: CardStyles;
}

/** Keyed by card style alone: there is no density preference, so every card is the full-size one. */
export const cardStyles: CardStyleConfig = {
  heading: {
    portrait: "text-lg! font-medium",
    landscape: "text-lg! font-semibold",
    circular: "text-md! font-semibold"
  },
  dimensions: {
    portrait: "w-56 h-[21rem]",
    landscape: "w-[26rem] h-44",
    circular: "w-60 h-60"
  },
  image: {
    portrait: "h-32",
    landscape: "w-48",
    circular: "w-28 h-28"
  },
  icon: {
    portrait: "160",
    landscape: "120",
    circular: "120"
  },
  iconHeight: {
    portrait: "30",
    landscape: "40",
    circular: "50"
  },
  text: {
    portrait: "prose line-clamp-3 leading-6 dark:prose-invert",
    landscape: "prose line-clamp-3 leading-6 dark:prose-invert",
    circular: "prose line-clamp-3 leading-6 dark:prose-invert"
  },
  avatar: {
    portrait: "w-12",
    landscape: "w-12",
    circular: "w-12"
  },
  container: {
    portrait: "border-y-8 flex flex-col",
    landscape: "border-l-8 flex",
    circular: "rounded-full border-4 flex flex-col"
  }
};
