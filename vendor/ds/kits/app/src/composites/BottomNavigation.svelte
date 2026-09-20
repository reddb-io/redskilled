<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import NavItem from "../primitives/NavItem.svelte";
  import { bottomNavigation } from "./bottom-navigation.variants";
  import { navigationItems, type ApplicationNavigationItem } from "./navigation.behavior";

  interface Props extends Omit<HTMLAttributes<HTMLElement>, "class"> {
    label: string;
    items: readonly ApplicationNavigationItem[];
    currentId: string;
    class?: string;
  }

  const { label, items, currentId, class: className, ...rest }: Props = $props();
  const resolvedItems = $derived(navigationItems(items, currentId));
  const styles = $derived(bottomNavigation());
</script>

<nav
  {...rest}
  aria-label={label}
  data-bottom-navigation
  class={styles.root({ class: className })}
>
  <ul class={styles.list()}>
    {#each resolvedItems as item (item.id)}
      <li class={styles.entry()}>
        <NavItem
          label={item.label}
          href={item.href}
          active={item.current}
          disabled={item.disabled}
          data-navigation-item={item.id}
          class={styles.item()}
          onclick={item.onselect}
        />
      </li>
    {/each}
  </ul>
</nav>
