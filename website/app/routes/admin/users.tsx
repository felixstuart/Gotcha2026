import type { Route } from "../../+types/root";
import { auth, functions } from "../../../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { Form, redirect } from "react-router";
import type {
  AdminIndex,
  AdminIndexRow,
  AdminProfileChanges,
  ClientTaggedOutResponse,
  Profile,
} from "../../../../types";
import { TagOut } from "../../../components/TagOut";
import { useSearchParams } from "react-router";
import { AllCommunityModule } from "ag-grid-community";
import { AgGridProvider, AgGridReact } from "ag-grid-react";
import { useMemo, useRef, useState } from "react";
import type { CustomCellRendererProps } from "ag-grid-react";

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const user = await new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
  // @ts-expect-error
  if (!user || !user.email?.endsWith("@milton.edu")) {
    return redirect("/");
  }

  const getProfile = httpsCallable(functions, "getProfile");
  // getProfile returns { profile, claimsChanged }
  const adminProfileData = (await getProfile({})).data as {
    profile?: Profile;
    claimsChanged?: boolean;
  } | null; // always pass an object
  const adminProfileResult = adminProfileData?.profile;

  if (adminProfileResult?.role != "admin") {
    return redirect("/app/profile");
  }

  // the admin-only calls below check the admin claim on our token,
  // so refresh it if the server just set it
  if (adminProfileData?.claimsChanged) {
    await auth.currentUser?.getIdToken(true);
  }

  const getAdminIndex = httpsCallable<unknown, { index: AdminIndex }>(
    functions,
    "getAdminIndex",
  );
  // throws (e.g. not-found if rebuildAdminIndex was never run) instead of returning a status
  const adminIndexResult = await getAdminIndex({});

  return {
    adminProfile: adminProfileResult,
    adminIndex: adminIndexResult.data.index,
  };
}

// one table row: the player's email (the key in adminIndex.players) plus their index row
function toGridRow(email: string, player: AdminIndexRow) {
  return {
    email,
    firstName: player.firstName,
    lastName: player.lastName,
    targetEmail: player.targetEmail,
    chaser: player.chaser,
    alive: player.alive,
    tags: player.tags,
  };
}

export default function UserPanel({ loaderData }: Route.ComponentProps) {
  const { adminProfile, adminIndex } = loaderData as unknown as {
    adminProfile: Profile | null;
    adminIndex: AdminIndex | null;
  };

  const [colDefs, setColDefs] = useState([
    { field: "firstName", headerName: "First Name" },
    { field: "lastName", headerName: "Last Name" },
    // the email is the player's id, so it can't be edited
    { field: "email", headerName: "Email", editable: false },
    // both hold emails, and the field names match what adminUpdateProfile accepts,
    // so editing one moves players around the chain on the server
    {
      field: "targetEmail",
      headerName: "Target",
      valueFormatter: (params: { value: string }) => params.value || "none",
    },
    {
      field: "chaser",
      headerName: "Chaser",
      valueFormatter: (params: { value: string }) => params.value || "none",
    },
    { field: "tags", headerName: "Tags" },
    {
      headerName: "Actions",
      cellRenderer: ActionsCell,
      editable: false,
      sortable: false,
      filter: false,
    },
  ]);

  // we just destructure the admin index into an array of rows for the table
  const [rowData, setRowData] = useState(
    Object.entries(adminIndex?.players || {}).map(([email, player]) =>
      toGridRow(email, player),
    ),
  );

  const defaultColDef = useMemo(
    () => ({
      editable: true, // Enable editing on all cells
      sortable: true, // Enable sorting on all columns
      filter: true, // Enable filtering on all columns
    }),
    [],
  );

  // returns the edited player's row, plus the rows of anyone a chain change moved
  const adminUpdateProfile = httpsCallable<
    { email: string; changes: AdminProfileChanges },
    { row: AdminIndexRow; affected: Record<string, AdminIndexRow> }
  >(functions, "adminUpdateProfile");
  const tagOut = httpsCallable<{ email: string }, ClientTaggedOutResponse>(
    functions,
    "tagOut",
  );
  const rebuildAdminIndex = httpsCallable<unknown, { players: number }>(
    functions,
    "rebuildAdminIndex",
  );
  const getAdminIndex = httpsCallable<unknown, { index: AdminIndex }>(
    functions,
    "getAdminIndex",
  );

  const gridRef = useRef<AgGridReact<ReturnType<typeof toGridRow>>>(null);

  // swaps in the rows the server sent back, so the table matches without refetching
  const patchRows = (rows: Record<string, AdminIndexRow>) => {
    for (const [email, row] of Object.entries(rows)) {
      gridRef.current?.api.getRowNode(email)?.setData(toGridRow(email, row));
    }
  };

  // the server's message says what went wrong (e.g. "already out" or "pick a chaser")
  const showError = (err: unknown) => {
    console.error(err);
    alert(err instanceof Error ? err.message : "Something went wrong");
  };

  const onTagOut = async (email: string) => {
    try {
      const res = await tagOut({ email });
      patchRows(res.data.rows);
      if (res.data.winner) {
        alert(`${res.data.winner} is the last player standing!`);
      }
    } catch (err) {
      showError(err);
    }
  };

  const onRevive = async (email: string) => {
    try {
      const res = await adminUpdateProfile({ email, changes: { alive: true } });
      patchRows({ [email]: res.data.row, ...res.data.affected });
    } catch (err) {
      showError(err);
    }
  };

  // rebuilds the index from every profile (1 read per player), then reloads the table
  const [reindexing, setReindexing] = useState(false);
  const onReindex = async () => {
    setReindexing(true);
    try {
      await rebuildAdminIndex({});
      const res = await getAdminIndex({});
      setRowData(
        Object.entries(res.data.index.players).map(([email, player]) =>
          toGridRow(email, player),
        ),
      );
    } catch (err) {
      showError(err);
    } finally {
      setReindexing(false);
    }
  };

  return (
    <div className="p-4 bg-slate-900 w-screen h-screen">
      <div className="p-4">
        <div className="flex justify-end pb-4">
          <button
            className="px-3 py-1 rounded bg-slate-700 text-white text-sm hover:bg-slate-600 disabled:opacity-50"
            onClick={onReindex}
            disabled={reindexing}
          >
            {reindexing ? "Re-indexing..." : "Re-index"}
          </button>
        </div>
        <AgGridProvider modules={[AllCommunityModule]}>
          <div className="h-[500px] bg-slate-900 [--ag-background-color:#0f172a] [--ag-foreground-color:#f8fafc] [--ag-header-background-color:#0f172a] [--ag-border-color:#334155]">
            <AgGridReact
              ref={gridRef}
              rowData={rowData}
              columnDefs={colDefs}
              defaultColDef={defaultColDef}
              // lets us find other players' rows by email when a chain edit moves them
              getRowId={(params) => params.data.email}
              onCellValueChanged={async (e) => {
                try {
                  const res = await adminUpdateProfile({
                    email: e.data.email,
                    changes: {
                      [e.colDef.field!]: e.newValue,
                    } as AdminProfileChanges,
                  });
                  patchRows({ [e.data.email]: res.data.row, ...res.data.affected });
                } catch (err) {
                  e.node.setDataValue(e.colDef.field!, e.oldValue); // put the old value back if the server said no
                  console.error(err);
                }
              }}
              context={{ onTagOut, onRevive }}
            />
          </div>
        </AgGridProvider>
      </div>
    </div>
  );
}

function ActionsCell(params: CustomCellRendererProps) {
  return (
    <div className="flex gap-2 items-center h-full">
      {params.data.alive ? (
        <button
          className="px-2 py-0.5 rounded bg-red-600 text-white text-sm hover:bg-red-700"
          onClick={() => params.context.onTagOut(params.data.email)}
        >
          Tag out
        </button>
      ) : (
        <button
          className="px-2 py-0.5 rounded bg-green-600 text-white text-sm hover:bg-green-700"
          onClick={() => params.context.onRevive(params.data.email)}
        >
          Revive
        </button>
      )}
    </div>
  );
}
