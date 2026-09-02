import { PUBLIC_ANON_MODE } from "$env/static/public";
import type { Course } from "@tutors/tutors-model-lib";
import { isEducator, tutorsId } from "@tutors/runes";

export function isQuizEducator(): boolean {
  if (typeof window !== "undefined" && window.localStorage.getItem("tutors-test-role") === "student") {
    return false;
  }
  if (PUBLIC_ANON_MODE === "TRUE") return true;
  return isEducator.value;
}

export function isQuizEnabled(course: Course | null): boolean {
  if (!course) return false;
  if (PUBLIC_ANON_MODE === "TRUE") return true;
  return (course.enrollment?.educators?.length ?? 0) > 0;
}

export function getQuizUserId(): string {
  if (tutorsId.value?.login) return tutorsId.value.login;
  if (typeof window !== "undefined") {
    if (!window.localStorage.quizAnonId) {
      window.localStorage.quizAnonId = "anon-" + Math.random().toString(36).slice(2, 10);
    }
    return window.localStorage.quizAnonId;
  }
  return "anon";
}

export function getQuizUserName(): string {
  return tutorsId.value?.name ?? "Anonymous";
}

export function getQuizUserAvatar(): string {
  return tutorsId.value?.image ?? "https://tutors.dev/logo.svg";
}
