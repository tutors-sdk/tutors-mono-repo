<script lang="ts">
  interface Props {
    status: number;
    message?: string;
  }
  let { status, message }: Props = $props();

  const errorInfo: Record<number, { heading: string; guidance: string }> = {
    400: {
      heading: "Bad Request",
      guidance: "The request could not be understood. Check the URL and try again."
    },
    403: {
      heading: "Access Denied",
      guidance: "You don't have permission to access this page. If you believe this is an error, contact your course administrator."
    },
    404: {
      heading: "Page Not Found",
      guidance: "The page you're looking for doesn't exist. Check the URL or try navigating from the home page."
    },
    500: {
      heading: "Server Error",
      guidance: "Something went wrong on our end. Try refreshing the page or come back later."
    }
  };

  const info = $derived(errorInfo[status] ?? { heading: "Error", guidance: message ?? "Something went wrong." });
</script>

<section class="flex min-h-[60vh] flex-col items-center justify-center p-8 text-center" role="alert" aria-live="assertive">
  <h1 class="text-8xl font-bold text-error-500">{status}</h1>
  <h2 class="mt-4 text-2xl font-semibold">{info.heading}</h2>
  <p class="text-surface-500 mt-3 max-w-md text-lg">{info.guidance}</p>

  <nav class="mt-8 flex flex-wrap items-center justify-center gap-4" aria-label="Error recovery options">
    <a href="/" class="btn preset-tonal-primary">Go Home</a>
    <a
      href="https://github.com/tutors-sdk/tutors/issues/new"
      target="_blank"
      rel="noopener noreferrer"
      class="btn preset-tonal-surface"
    >
      Report an Issue
    </a>
  </nav>
</section>
