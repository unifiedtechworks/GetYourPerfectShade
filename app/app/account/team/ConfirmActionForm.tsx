"use client";

export function ConfirmActionForm({
  action,
  confirmation,
  children,
}: {
  action: (formData: FormData) => void | Promise<void>;
  confirmation: string;
  children: React.ReactNode;
}) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(confirmation)) event.preventDefault();
      }}
    >
      {children}
    </form>
  );
}
