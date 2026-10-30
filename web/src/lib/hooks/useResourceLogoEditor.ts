import type { ChangeEvent } from "react";

import { useState } from "react";

import { useSaveResourceLogo } from "@/lib/hooks/useSaveResourceLogo";

export function useResourceLogoEditor(id: string) {
  const mutation = useSaveResourceLogo(id);
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setError("");
    if (
      file.size > 2 * 1024 * 1024 ||
      !["image/png", "image/jpeg", "image/webp"].includes(file.type)
    ) {
      setError("Choose a PNG, JPEG, or WebP image up to 2 MiB.");
      return;
    }
    setReading(true);
    const reader = new FileReader();
    reader.onerror = () => {
      setReading(false);
      setError("Unable to read this image.");
    };
    reader.onload = () => {
      setReading(false);
      if (typeof reader.result !== "string") {
        setError("Unable to read this image.");
        return;
      }
      mutation.mutate(reader.result.slice(reader.result.indexOf(",") + 1));
    };
    reader.readAsDataURL(file);
  }
  function removeLogo() {
    setError("");
    mutation.mutate(null);
  }
  return { busy: reading || mutation.isPending, error, selectFile, removeLogo };
}
