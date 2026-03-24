"use client";

import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

interface DateNavigatorProps {
  date: string;
  calendarOpen: boolean;
  onCalendarOpenChange: (open: boolean) => void;
  onDateSelect: (d: Date | undefined) => void;
  onPrevDay: () => void;
  onNextDay: () => void;
}

export function DateNavigator({
  date,
  calendarOpen,
  onCalendarOpenChange,
  onDateSelect,
  onPrevDay,
  onNextDay,
}: DateNavigatorProps) {
  const selectedDate = new Date(date + "T00:00:00");

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="icon" onClick={onPrevDay}>
        &larr;
      </Button>
      <Popover open={calendarOpen} onOpenChange={onCalendarOpenChange}>
        <PopoverTrigger
          render={
            <Button variant="outline" className="min-w-[140px] gap-2" />
          }
        >
          <CalendarIcon className="size-4" />
          {date}
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={onDateSelect}
            defaultMonth={selectedDate}
          />
        </PopoverContent>
      </Popover>
      <Button variant="outline" size="icon" onClick={onNextDay}>
        &rarr;
      </Button>
    </div>
  );
}
