import { Plus, RefreshCw } from "lucide-react";

import type { Resource } from "@/lib/api/types";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ConfigurationSurface";
import { Confirm } from "@/components/Shared";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

import { useDNSRecordsPage } from "../hooks";
import { DNSRecordForm } from "./DNSRecordForm";
import { DNSRecordTable } from "./DNSRecordTable";
export type DNSRecordsProps = { zone: Resource };
export function DNSRecords({ zone }: DNSRecordsProps) {
  const controller = useDNSRecordsPage(zone);
  const { edit, extra, deleteId } = controller.state;
  const { q, recordId, saveRecord, removeRecord } = controller.derived;
  const {
    setEdit,
    setExtra,
    save,
    navigate,
    confirmRemoval,
    addRecord,
    refreshRecords,
    handleOpenChange,
    handleDeleteOpenChange,
  } = controller.handlers;
  return (
    <>
      {!recordId && (
        <>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <Button
              variant="outline"
              disabled={q.isFetching}
              onClick={refreshRecords}
            >
              {q.isFetching ? <Spinner className="size-4" /> : <RefreshCw />}
              Refresh records
            </Button>
            <Button disabled={!zone.canWrite} onClick={addRecord}>
              <Plus />
              Add record
            </Button>
          </div>
          <DNSRecordTable zone={zone} controller={controller} />
        </>
      )}
      <Dialog open={!!edit} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{edit?.id ? "Edit" : "New"} DNS record</DialogTitle>
            <DialogDescription>
              Provider-specific values are preserved when editing an existing
              record.
            </DialogDescription>
          </DialogHeader>
          {edit && (
            <DNSRecordForm
              edit={edit}
              setEdit={setEdit}
              extra={extra}
              setExtra={setExtra}
              busy={saveRecord.isPending}
              pendingRecord={saveRecord.variables}
              save={save}
              navigate={navigate}
              zone={zone}
            />
          )}
        </DialogContent>
      </Dialog>
      <Confirm
        open={!!deleteId}
        onOpenChange={handleDeleteOpenChange}
        title="Delete this DNS record?"
        description="This removes the record from your DNS provider."
        destructive
        pending={removeRecord.isPending}
        onConfirm={confirmRemoval}
      />
    </>
  );
}
