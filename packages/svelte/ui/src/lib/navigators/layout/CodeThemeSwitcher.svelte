<script lang="ts">
  import { themeService } from "@tutors/themes";
  import { courseService } from "@tutors/course/course";
  import { currentCodeTheme, markdownService } from "@tutors/course/markdown";
  import { Combobox, Portal } from "@skeletonlabs/skeleton-svelte";
  import { currentCourse } from "@tutors/runes";

  const codeThemeItems = markdownService.codeThemes.map((element: { displayName: string; name: string }) => ({
    label: element.displayName,
    value: element.name
  }));
  let codeTheme = $state([currentCodeTheme.value]);

  function changeCodeTheme(value: string[]) {
    codeTheme = value;
    markdownService.setCodeTheme(value[0]);
    if (currentCourse.value) {
      courseService.refreshAllLabs(themeService.currentTheme.value);
    }
  }
</script>

<div class="relative z-10 mx-4 mb-2">
  <Combobox class="w-full max-w-md" placeholder={codeTheme[0]} onValueChange={(e) => changeCodeTheme(e.value!)}>
    <Combobox.Control>
      <Combobox.Input />
      <Combobox.Trigger />
    </Combobox.Control>
    <Portal>
      <Combobox.Positioner class="z-[1000]!">
        <Combobox.Content>
          {#each codeThemeItems as item (item.value)}
            <Combobox.Item {item}>
              <Combobox.ItemText>{item.label}</Combobox.ItemText>
              <Combobox.ItemIndicator />
            </Combobox.Item>
          {/each}
        </Combobox.Content>
      </Combobox.Positioner>
    </Portal>
  </Combobox>
</div>
