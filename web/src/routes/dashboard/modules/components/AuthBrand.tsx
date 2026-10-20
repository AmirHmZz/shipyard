import { Anchor, GitBranch, Server } from "lucide-react";

import { Badge } from "@/components/ui/badge";
export function AuthBrand() {
  return (
    <div className="relative hidden flex-col justify-between overflow-hidden bg-[#1b2d21] p-12 text-[#edf3e7] lg:flex">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-[#c1d7a8] text-[#243c28]">
          <Anchor className="size-6" />
        </div>
        <span className="text-xl font-semibold tracking-tight">
          shipyard<span className="text-[#a5ba91]">.</span>
        </span>
      </div>
      <div className="relative z-10 max-w-lg">
        <Badge
          className="mb-7 border-[#839c6c]/30 bg-[#c1d7a8]/10 font-mono text-[10px] tracking-widest text-[#c1d7a8]"
          variant="outline"
        >
          YOUR INFRASTRUCTURE. YOUR CONTROL.
        </Badge>
        <h1 className="text-5xl leading-[1.15] font-medium tracking-tight">
          A clear view.
          <br />A steady release.
        </h1>
        <p className="mt-6 max-w-sm text-base leading-7 text-[#adbea8]">
          From your repository to your server. Build, deploy, and roll back from
          one focused workspace.
        </p>
        <div className="mt-10 flex items-center gap-3 text-[#c1d7a8]">
          <GitBranch className="size-5" />
          <div className="h-px w-12 bg-[#6c855a]" />
          <div className="rounded-lg border border-[#617651] p-3">
            <Anchor className="size-6" />
          </div>
          <div className="h-px w-12 bg-[#6c855a]" />
          <Server className="size-5" />
        </div>
      </div>
      <div className="text-xs text-[#8fa585]">Built for the way you ship.</div>
      <div className="pointer-events-none absolute -right-40 bottom-10 size-[500px] rounded-full border border-[#8ba878]/10" />
      <div className="pointer-events-none absolute -right-24 bottom-26 size-[370px] rounded-full border border-[#8ba878]/10" />
    </div>
  );
}
