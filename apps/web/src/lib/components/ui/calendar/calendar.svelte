<script lang="ts">
  import { Calendar as CalendarPrimitive } from 'bits-ui';
  import type { DateValue } from '@internationalized/date';
  import { ChevronLeft, ChevronRight } from 'lucide-svelte';
  import { cn } from '$lib/utils';

  interface Props {
    value?: DateValue;
    onValueChange?: (value: DateValue | undefined) => void;
    minValue?: DateValue;
    class?: string;
  }

  let { value = $bindable(), onValueChange, minValue, class: className }: Props = $props();
</script>

<CalendarPrimitive.Root
  type="single"
  bind:value
  {onValueChange}
  {minValue}
  weekdayFormat="short"
  class={cn('p-3', className)}
>
  {#snippet children({ months, weekdays })}
    <CalendarPrimitive.Header class="flex items-center justify-between mb-4">
      <CalendarPrimitive.PrevButton
        class="inline-flex h-7 w-7 items-center justify-center rounded-md border border-input bg-background p-0 text-sm opacity-50 hover:opacity-100 hover:bg-accent transition-opacity disabled:pointer-events-none"
      >
        <ChevronLeft class="h-4 w-4" />
      </CalendarPrimitive.PrevButton>
      <CalendarPrimitive.Heading class="text-sm font-medium" />
      <CalendarPrimitive.NextButton
        class="inline-flex h-7 w-7 items-center justify-center rounded-md border border-input bg-background p-0 text-sm opacity-50 hover:opacity-100 hover:bg-accent transition-opacity disabled:pointer-events-none"
      >
        <ChevronRight class="h-4 w-4" />
      </CalendarPrimitive.NextButton>
    </CalendarPrimitive.Header>
    {#each months as month (month.value)}
      <CalendarPrimitive.Grid class="w-full border-collapse">
        <CalendarPrimitive.GridHead>
          <CalendarPrimitive.GridRow class="flex">
            {#each weekdays as weekday}
              <CalendarPrimitive.HeadCell
                class="w-9 text-center text-[0.75rem] font-normal text-muted-foreground"
              >
                {weekday.slice(0, 2)}
              </CalendarPrimitive.HeadCell>
            {/each}
          </CalendarPrimitive.GridRow>
        </CalendarPrimitive.GridHead>
        <CalendarPrimitive.GridBody>
          {#each month.weeks as weekDates (weekDates)}
            <CalendarPrimitive.GridRow class="flex mt-1">
              {#each weekDates as date (date)}
                <CalendarPrimitive.Cell
                  {date}
                  month={month.value}
                  class="relative p-0 text-center text-sm"
                >
                  <CalendarPrimitive.Day
                    class="inline-flex h-9 w-9 items-center justify-center rounded-md p-0 text-sm font-normal transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[outside-month]:opacity-30 data-[selected]:bg-primary data-[selected]:text-primary-foreground data-[selected]:hover:bg-primary data-[selected]:hover:text-primary-foreground data-[today]:bg-accent data-[today]:text-accent-foreground data-[today]:data-[selected]:bg-primary data-[today]:data-[selected]:text-primary-foreground"
                  />
                </CalendarPrimitive.Cell>
              {/each}
            </CalendarPrimitive.GridRow>
          {/each}
        </CalendarPrimitive.GridBody>
      </CalendarPrimitive.Grid>
    {/each}
  {/snippet}
</CalendarPrimitive.Root>
