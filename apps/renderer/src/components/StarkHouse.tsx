import { cn } from '../lib/cn';
import { StarkHomeCanvas } from './stark-home/StarkHomeCanvas';

export function StarkHouse({
  className,
  fullscreen = false,
}: {
  className?: string;
  fullscreen?: boolean;
}) {
  return (
    <div
      className={cn(
        'relative isolate overflow-hidden bg-[#17161b] select-none',
        fullscreen && 'h-full w-full',
        className,
      )}
    >
      <StarkHomeCanvas />
    </div>
  );
}
