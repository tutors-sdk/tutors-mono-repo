<script lang="ts">
  let currentStep = $state(0);
  let courseName = $state("");
  let lecturerName = $state("");
  let courseId = $state("");
  let topicCount = $state(2);
  let labsPerTopic = $state(1);
  let labStepCount = $state(3);
  let includeTalks = $state(false);
  let includeNotes = $state(false);
  let downloaded = $state(false);

  const steps = ["Course Info", "Structure", "Preview", "Download"];

  function slugify(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function padNum(n: number): string {
    return String(n).padStart(2, "0");
  }

  function next() {
    if (currentStep < steps.length - 1) currentStep++;
  }
  function back() {
    if (currentStep > 0) currentStep--;
  }

  function submitInfo() {
    courseId = slugify(courseName) || "my-new-course";
    next();
  }

  interface TreeNode {
    name: string;
    children?: TreeNode[];
  }

  function buildTree(): TreeNode {
    const root: TreeNode = {
      name: courseId + "/",
      children: []
    };
    root.children!.push({ name: "course.md" }, { name: "properties.yaml" });

    for (let t = 1; t <= topicCount; t++) {
      const ts = "topic-" + padNum(t);
      const tn: TreeNode = { name: ts + "/", children: [{ name: ts + ".md" }] };

      for (let l = 1; l <= labsPerTopic; l++) {
        const ls = "book-lab-" + padNum(l);
        const ln: TreeNode = { name: ls + "/", children: [{ name: "00.Setup.md" }] };
        for (let s = 1; s < labStepCount; s++) {
          ln.children!.push({ name: padNum(s) + ".Step-" + padNum(s) + ".md" });
        }
        tn.children!.push(ln);
      }

      if (includeTalks) {
        const s = "talk-" + padNum(t);
        tn.children!.push({ name: s + "/", children: [{ name: s + ".md" }] });
      }
      if (includeNotes) {
        const s = "note-" + padNum(t);
        tn.children!.push({ name: s + "/", children: [{ name: s + ".md" }] });
      }

      root.children!.push(tn);
    }
    return root;
  }

  function buildCourseJson(): object {
    const topics = [];
    for (let t = 1; t <= topicCount; t++) {
      const tSlug = "topic-" + padNum(t);
      const los: object[] = [];

      for (let l = 1; l <= labsPerTopic; l++) {
        const lSlug = "book-lab-" + padNum(l);
        const labSteps = [
          {
            title: "Lab " + l,
            shortTitle: "Setup",
            contentMd:
              "## Prerequisites\n\n- List any tools or accounts needed\n\n## Getting Started\n\nDescribe the initial setup steps here."
          }
        ];
        for (let s = 1; s < labStepCount; s++) {
          labSteps.push({
            title: "Step " + s,
            shortTitle: "Step-" + padNum(s),
            contentMd: "Write your lab instructions for step " + s + " of " + (labStepCount - 1) + " here."
          });
        }
        los.push({
          type: "lab",
          id: lSlug,
          title: "Lab " + l,
          summary: "Hands-on lab " + l + " for topic " + t + ".",
          route: "/" + courseId + "/" + tSlug + "/" + lSlug,
          los: labSteps
        });
      }

      if (includeTalks) {
        los.push({
          type: "talk",
          id: "talk-" + padNum(t),
          title: "Talk " + t,
          summary: "Summary of talk " + t + ".",
          contentMd: "This talk covers the key concepts introduced in topic " + t + ".",
          route: "/" + courseId + "/" + tSlug + "/talk-" + padNum(t)
        });
      }

      if (includeNotes) {
        los.push({
          type: "note",
          id: "note-" + padNum(t),
          title: "Note " + t,
          summary: "Summary of note " + t + ".",
          contentMd: "Add your reference material here.",
          route: "/" + courseId + "/" + tSlug + "/note-" + padNum(t)
        });
      }

      topics.push({
        type: "topic",
        id: tSlug,
        title: "Topic " + t,
        summary: "Summary of topic " + t + " (edit this text).",
        contentMd: "This topic introduces the key concepts for week " + t + " of the course.",
        route: "/" + courseId + "/" + tSlug,
        los
      });
    }

    return {
      type: "course",
      id: courseId,
      title: courseName,
      summary: (lecturerName ? "By " + lecturerName + ". " : "") + "A short summary of your course goes here.",
      contentMd: "Welcome to " + courseName + "! Describe what students will learn.",
      properties: { footer: lecturerName || "Department Name" },
      los: topics
    };
  }

  function handleDownload() {
    const json = JSON.stringify(buildCourseJson(), null, 2);
    const blob = new Blob([json], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = courseId + ".json";
    a.click();
    URL.revokeObjectURL(url);
    downloaded = true;
  }
</script>

{#snippet renderNode(node: TreeNode, depth: number)}
  <div style="padding-left: {depth * 1.25}rem" class="py-0.5">
    {#if node.children}
      <span class="font-semibold text-primary-600 dark:text-primary-400">{node.name}</span>
      {#each node.children as child}
        {@render renderNode(child, depth + 1)}
      {/each}
    {:else}
      <span class="text-surface-600 dark:text-surface-400">{node.name}</span>
    {/if}
  </div>
{/snippet}

<div class="container mx-auto max-w-3xl p-4">
  <div class="card m-4 space-y-6 p-6">
    <h2 class="h2 text-center">Create a New Course</h2>

    <div class="flex items-center justify-center gap-2">
      {#each steps as step, i}
        <div class="flex items-center gap-2">
          <button
            class="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold transition-colors
              {i === currentStep
              ? 'bg-primary-500 text-white'
              : i < currentStep
                ? 'bg-success-500 text-white'
                : 'bg-surface-300 dark:bg-surface-600 text-surface-600 dark:text-surface-300'}"
            onclick={() => {
              if (i < currentStep) currentStep = i;
            }}
            disabled={i > currentStep}
          >
            {#if i < currentStep}&#10003;{:else}{i + 1}{/if}
          </button>
          <span class="hidden text-sm sm:inline {i === currentStep ? 'font-bold' : 'text-surface-500'}">{step}</span>
          {#if i < steps.length - 1}<div class="mx-1 h-px w-8 bg-surface-300 dark:bg-surface-600"></div>{/if}
        </div>
      {/each}
    </div>

    <div class="mt-6">
      {#if currentStep === 0}
        <form
          class="space-y-6"
          onsubmit={(e) => {
            e.preventDefault();
            submitInfo();
          }}
        >
          <div>
            <label class="label mb-1 font-semibold" for="courseName"
              >Course Name <span class="text-error-500">*</span></label
            >
            <input
              id="courseName"
              class="input w-full rounded-sm"
              type="text"
              placeholder="e.g. Web Development Fundamentals"
              bind:value={courseName}
              required
            />
            <p class="mt-1 text-sm text-surface-500">This becomes the main heading and title of your course.</p>
          </div>
          <div>
            <label class="label mb-1 font-semibold" for="lecturerName">Your Name</label>
            <input
              id="lecturerName"
              class="input w-full rounded-sm"
              type="text"
              placeholder="e.g. Dr. Jane Smith"
              bind:value={lecturerName}
            />
            <p class="mt-1 text-sm text-surface-500">Appears in the course description. Optional.</p>
          </div>
          <div class="flex justify-end">
            <button
              class="btn rounded-sm bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-50"
              type="submit"
              disabled={courseName.trim().length === 0}>Next &rarr;</button
            >
          </div>
        </form>
      {:else if currentStep === 1}
        <form
          class="space-y-6"
          onsubmit={(e) => {
            e.preventDefault();
            next();
          }}
        >
          <div>
            <label class="label mb-1 font-semibold" for="topicCount">Number of Topics</label>
            <input
              id="topicCount"
              class="input w-full rounded-sm"
              type="number"
              min="1"
              max="12"
              bind:value={topicCount}
            />
            <p class="mt-1 text-sm text-surface-500">
              Topics are the main sections of your course (like weeks or modules).
            </p>
          </div>
          <div>
            <label class="label mb-1 font-semibold" for="labsPerTopic">Labs per Topic</label>
            <input
              id="labsPerTopic"
              class="input w-full rounded-sm"
              type="number"
              min="0"
              max="4"
              bind:value={labsPerTopic}
            />
            <p class="mt-1 text-sm text-surface-500">Hands-on exercises with step-by-step instructions.</p>
          </div>
          {#if labsPerTopic > 0}
            <div>
              <label class="label mb-1 font-semibold" for="labStepCount">Steps per Lab</label>
              <input
                id="labStepCount"
                class="input w-full rounded-sm"
                type="number"
                min="2"
                max="8"
                bind:value={labStepCount}
              />
              <p class="mt-1 text-sm text-surface-500">
                Each lab is split into numbered steps (includes a setup step).
              </p>
            </div>
          {/if}
          <div class="flex gap-6">
            <label class="flex items-center gap-2">
              <input type="checkbox" class="checkbox" bind:checked={includeTalks} />
              <span class="font-semibold">Include Talks</span>
            </label>
            <label class="flex items-center gap-2">
              <input type="checkbox" class="checkbox" bind:checked={includeNotes} />
              <span class="font-semibold">Include Notes</span>
            </label>
          </div>
          <p class="text-sm text-surface-500">
            Talks are for presentations (PDF/Marp slides). Notes are for reference material.
          </p>
          <div class="flex justify-between">
            <button class="btn rounded-sm bg-surface-300 dark:bg-surface-600" type="button" onclick={back}
              >&larr; Back</button
            >
            <button class="btn rounded-sm bg-primary-500 text-white hover:bg-primary-600" type="submit"
              >Next &rarr;</button
            >
          </div>
        </form>
      {:else if currentStep === 2}
        <div class="space-y-4">
          <div
            class="rounded-sm border border-surface-300 bg-surface-100 p-4 font-mono text-sm dark:border-surface-600 dark:bg-surface-800"
          >
            {@render renderNode(buildTree(), 0)}
          </div>
          <div class="flex justify-between">
            <button class="btn rounded-sm bg-surface-300 dark:bg-surface-600" onclick={back}>&larr; Back</button>
            <button class="btn rounded-sm bg-primary-500 text-white hover:bg-primary-600" onclick={next}
              >Generate &rarr;</button
            >
          </div>
        </div>
      {:else if currentStep === 3}
        <div class="space-y-6 text-center">
          {#if !downloaded}
            <p class="text-lg font-semibold">Your course is ready!</p>
            <p class="text-surface-500">Click below to download your course skeleton as a JSON file.</p>
            <button
              class="btn rounded-sm bg-primary-500 px-8 py-3 text-lg text-white hover:bg-primary-600"
              onclick={handleDownload}>Download {courseId}.json</button
            >
          {:else}
            <p class="text-lg font-semibold text-success-600 dark:text-success-400">Downloaded!</p>
            <div
              class="mx-auto max-w-md space-y-3 rounded-sm border border-surface-300 bg-surface-100 p-4 text-left dark:border-surface-600 dark:bg-surface-800"
            >
              <p class="font-semibold">Next steps:</p>
              <ol class="list-inside list-decimal space-y-1 text-sm">
                <li>Open <code class="code">{courseId}.json</code> and review the structure</li>
                <li>Edit titles, summaries, and content throughout</li>
                <li>Deploy to serve via the Tutors reader</li>
              </ol>
            </div>
            <button class="btn rounded-sm bg-primary-500 text-white hover:bg-primary-600" onclick={handleDownload}
              >Download Again</button
            >
          {/if}
          <div class="flex justify-start">
            <button class="btn rounded-sm bg-surface-300 dark:bg-surface-600" onclick={back}>&larr; Back</button>
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>
