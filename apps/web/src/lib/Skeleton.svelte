<script lang="ts">
  // A single shimmering placeholder block. Sizing is passed via props so the
  // same primitive covers text lines, number blocks, chart bodies, etc.
  let {
    width = '100%',
    height = '1rem',
    radius = '6px',
    style = ''
  }: { width?: string; height?: string; radius?: string; style?: string } = $props();
</script>

<span
  class="skel"
  style="width:{width};height:{height};border-radius:{radius};{style}"
  aria-hidden="true"
></span>
