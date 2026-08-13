<script lang="ts">
  import { page } from "$app/state";
  import ErrorPage from "@tutors/ui-primitives/components/ErrorPage.svelte";
</script>

<ErrorPage status={page.status} message={page.error?.message} />
