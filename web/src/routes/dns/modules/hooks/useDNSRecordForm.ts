import type { ChangeEvent, FormEvent } from "react";

import type { DNSRecord } from "@/lib/api/types";

import { inputNumberSchema } from "@/lib/schemas/coercion";

type FormActions = {
  edit: DNSRecord;
  setEdit: (record: DNSRecord) => void;
  setExtra: (extra: string) => void;
  save: () => void;
};
export function useDNSRecordForm({
  edit,
  setEdit,
  setExtra,
  save,
}: FormActions) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    save();
  }
  function changeType(type: string) {
    setEdit({ ...edit, type });
  }
  function changeName(event: ChangeEvent<HTMLInputElement>) {
    setEdit({ ...edit, name: event.target.value });
  }
  function changeContent(event: ChangeEvent<HTMLInputElement>) {
    setEdit({ ...edit, content: event.target.value });
  }
  function changeTTL(event: ChangeEvent<HTMLInputElement>) {
    setEdit({ ...edit, ttl: inputNumberSchema.parse(event.target.value) });
  }
  function changePriority(event: ChangeEvent<HTMLInputElement>) {
    const priority = event.target.value
      ? inputNumberSchema.parse(event.target.value)
      : undefined;
    setEdit({ ...edit, priority });
  }
  function changeProxy(proxied: boolean) {
    setEdit({ ...edit, proxied });
  }
  function changeExtra(event: ChangeEvent<HTMLTextAreaElement>) {
    setExtra(event.target.value);
  }
  return {
    state: { edit },
    derived: {},
    handlers: {
      handleSubmit,
      changeType,
      changeName,
      changeContent,
      changeTTL,
      changePriority,
      changeProxy,
      changeExtra,
    },
  };
}
