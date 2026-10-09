<script lang="ts">
  import { createAuthClient } from "better-auth/svelte";
  const { data } = $props();
  const client = createAuthClient();
</script>

<p>{data.actor?.login ?? "Signed out"}</p>
<button onclick={() => client.signIn.social({ provider: "github", callbackURL: location.href })}>Sign in</button>
<button onclick={() => client.signOut()}>Sign out</button>
