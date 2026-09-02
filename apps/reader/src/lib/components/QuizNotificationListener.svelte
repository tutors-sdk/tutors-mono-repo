<script lang="ts">
  import { goto } from "$app/navigation";
  import { presenceService } from "@tutors/community";
  import { seedRemoteSession, seedRemoteQuiz, listenForQuizNotifications } from "@tutors/quiz";
  import type { QuizLiveStartedNotification } from "@tutors/quiz";

  let notification = $state<QuizLiveStartedNotification | null>(null);
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  function handleNotification(event: QuizLiveStartedNotification) {
    console.log("[quiz-listener] notification received", event.quizTitle);
    if (event.session) seedRemoteSession(event.session);
    if (event.quiz) seedRemoteQuiz(event.quiz);
    notification = event;
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => { notification = null; }, 15000);
  }

  $effect(() => {
    console.log("[quiz-listener] mounted");
    presenceService.onQuizStarted = handleNotification;
    const stopListening = listenForQuizNotifications(handleNotification);

    return () => {
      presenceService.onQuizStarted = undefined;
      stopListening();
      if (timeoutId) clearTimeout(timeoutId);
    };
  });

  function join() {
    if (!notification) return;
    const courseId = notification.courseId;
    const sessionId = notification.sessionId;
    notification = null;
    goto(`/quiz/${courseId}/live/${sessionId}`);
  }

  function dismiss() {
    notification = null;
  }
</script>

{#if notification}
  <div class="fixed top-4 right-4 z-50 max-w-sm">
    <div class="bg-primary-500 text-white rounded-xl shadow-xl p-4 space-y-2">
      <div class="flex items-center justify-between">
        <span class="font-bold">Live Quiz Started!</span>
        <button class="text-white/70 hover:text-white text-xl leading-none" onclick={dismiss}>&times;</button>
      </div>
      <p class="text-sm text-white/90">{notification.lecturerName} started &quot;{notification.quizTitle}&quot;</p>
      <button
        class="w-full py-2 rounded-lg bg-white text-primary-500 font-medium text-sm hover:bg-white/90 transition-colors"
        onclick={join}
      >
        Join Now
      </button>
    </div>
  </div>
{/if}
