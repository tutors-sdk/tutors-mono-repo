<script lang="ts">
  import { goto } from "$app/navigation";
  import { currentCourse } from "@tutors/runes";
  import {
    getQuizzesByCourse,
    getActiveSession,
    isQuizEducator,
    publishQuiz,
    archiveQuiz,
    createSession,
    getQuizUserId,
    getQuizUserName,
    broadcastQuizStarted
  } from "@tutors/quiz";
  import type { Quiz, QuizSession } from "@tutors/quiz";
  import Icon from "@tutors/ui-primitives/components/Icon.svelte";

  let quizzes = $state<Quiz[]>([]);
  let activeSession = $state<QuizSession | null>(null);
  let isLoading = $state(true);

  const courseId = $derived(currentCourse.value?.courseId ?? "");
  const educator = $derived(isQuizEducator());

  $effect(() => {
    if (courseId) loadQuizzes();
  });

  async function loadQuizzes() {
    isLoading = true;
    const [q, s] = await Promise.all([
      getQuizzesByCourse(courseId),
      getActiveSession(courseId)
    ]);
    quizzes = q;
    activeSession = s;
    isLoading = false;
  }

  async function handlePublish(quiz: Quiz) {
    await publishQuiz(quiz.id);
    await loadQuizzes();
  }

  async function handleArchive(quiz: Quiz) {
    await archiveQuiz(quiz.id);
    await loadQuizzes();
  }

  async function startLive(quiz: Quiz) {
    const session = await createSession(quiz.id, courseId, getQuizUserId());
    if (session) {
      broadcastQuizStarted({
        type: "quiz:live-started",
        sessionId: session.id,
        quizTitle: quiz.title,
        courseId,
        lecturerName: getQuizUserName(),
        quiz,
        session
      });
      goto(`/quiz/${courseId}/live/${session.id}/host`);
    }
  }

  const publishedQuizzes = $derived(quizzes.filter((q) => q.status === "published"));
  const draftQuizzes = $derived(quizzes.filter((q) => q.status === "draft"));
  const archivedQuizzes = $derived(quizzes.filter((q) => q.status === "archived"));
  const visibleQuizzes = $derived(educator ? quizzes : publishedQuizzes);
</script>

{#if isLoading}
  <div class="text-center py-12 text-surface-500">Loading quizzes...</div>
{:else}
  <div class="mx-4 mt-4 max-w-4xl mx-auto space-y-6">
    <div class="flex items-center justify-between">
      <h2 class="text-xl font-bold">Quizzes</h2>
      {#if educator}
        <button
          class="px-4 py-2 rounded-lg text-sm preset-filled-primary-500"
          onclick={() => goto(`/quiz/${courseId}/create`)}
        >
          + Create Quiz
        </button>
      {/if}
    </div>

    {#if activeSession}
      <div class="bg-primary-500/10 border-primary-500 border-[1px] rounded-xl p-4 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <span class="bg-error-500 h-3 w-3 rounded-full animate-pulse"></span>
          <span class="font-medium">Live quiz session in progress</span>
        </div>
        {#if educator}
          <button
            class="px-4 py-2 rounded-lg text-sm preset-filled-primary-500"
            onclick={() => goto(`/quiz/${courseId}/live/${activeSession!.id}/host`)}
          >
            Manage Session
          </button>
        {:else}
          <button
            class="px-4 py-2 rounded-lg text-sm preset-filled-primary-500"
            onclick={() => goto(`/quiz/${courseId}/live/${activeSession!.id}`)}
          >
            Join Live
          </button>
        {/if}
      </div>
    {/if}

    {#if visibleQuizzes.length === 0}
      <div class="border-primary-500 bg-surface-100 dark:bg-surface-900 rounded-xl border-[1px] p-8 text-center text-surface-500">
        {educator ? "No quizzes yet. Create your first quiz!" : "No quizzes available for this course."}
      </div>
    {:else}
      {#each visibleQuizzes as quiz}
        <div class="border-primary-500 bg-surface-100 dark:bg-surface-900 rounded-xl border-[1px] p-4">
          <div class="flex items-start justify-between">
            <div class="flex-1">
              <div class="flex items-center gap-2">
                <Icon type="quiz" tip="Quiz" />
                <h3 class="font-bold text-lg">{quiz.title}</h3>
                {#if educator}
                  <span class="text-xs px-2 py-0.5 rounded-full {quiz.status === 'published' ? 'bg-success-500/20 text-success-500' : quiz.status === 'draft' ? 'bg-warning-500/20 text-warning-500' : 'bg-surface-500/20 text-surface-500'}">
                    {quiz.status}
                  </span>
                {/if}
              </div>
              <div class="mt-1 text-sm text-surface-500">
                {quiz.questions.length} question{quiz.questions.length !== 1 ? "s" : ""}
                {#if quiz.timeLimit}
                  &middot; {quiz.timeLimit}s per question
                {/if}
                {#if quiz.source === "course"}
                  &middot; From course content
                {/if}
              </div>
            </div>
            <div class="flex items-center gap-2">
              {#if educator}
                {#if quiz.status === "draft"}
                  <button class="px-3 py-1.5 rounded-lg text-xs border-[1px] border-success-500 text-success-500 hover:bg-success-500/10" onclick={() => handlePublish(quiz)}>Publish</button>
                {/if}
                {#if quiz.status === "published"}
                  <button class="px-3 py-1.5 rounded-lg text-xs border-[1px] border-primary-500 text-primary-500 hover:bg-primary-500/10" onclick={() => startLive(quiz)}>Start Live</button>
                {/if}
                {#if quiz.source === "dynamic"}
                  <button class="px-3 py-1.5 rounded-lg text-xs border-[1px] border-surface-400 text-surface-500 hover:bg-surface-200 dark:hover:bg-surface-800" onclick={() => goto(`/quiz/${courseId}/${quiz.id}/edit`)}>Edit</button>
                {/if}
                <button class="px-3 py-1.5 rounded-lg text-xs border-[1px] border-surface-400 text-surface-500 hover:bg-surface-200 dark:hover:bg-surface-800" onclick={() => goto(`/quiz/${courseId}/${quiz.id}/results`)}>Results</button>
                {#if quiz.status !== "archived"}
                  <button class="px-3 py-1.5 rounded-lg text-xs text-error-500 hover:bg-error-500/10" onclick={() => handleArchive(quiz)}>Archive</button>
                {/if}
              {:else}
                <button class="px-4 py-2 rounded-lg text-sm preset-filled-primary-500" onclick={() => goto(`/quiz/${courseId}/${quiz.id}`)}>Take Quiz</button>
              {/if}
            </div>
          </div>
        </div>
      {/each}
    {/if}
  </div>
{/if}
