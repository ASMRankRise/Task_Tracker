import { useState } from "react";
import Alert from "../common/Alert";

function getDefaultDeadline() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}T18:00`;
}

function toSafeIso(dateInput) {
  if (!dateInput) return null;
  const d = new Date(dateInput);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function CreateTaskForm({ projects = [], onCreate, loading = false }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [project, setProject] = useState("");
  const [priority, setPriority] = useState("low");
  const [assignedTo, setAssignedTo] = useState("");
  const [dueDate, setDueDate] = useState(getDefaultDeadline());
  const [validationError, setValidationError] = useState("");

  const selectedProject = projects.find(
    (item) => String(item._id || item.id) === String(project),
  );

  const projectMembers = [
    ...(selectedProject?.owner ? [selectedProject.owner] : []),
    ...(selectedProject?.members || []),
  ].filter(
    (member, index, members) =>
      member?.email &&
      members.findIndex(
        (item) => item.email?.toLowerCase() === member.email.toLowerCase(),
      ) === index,
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    setValidationError("");

    if (!title.trim()) {
      setValidationError("Task title is required.");
      return;
    }

    if (!project) {
      setValidationError("Please select a project.");
      return;
    }

    if (!assignedTo) {
      setValidationError("Please select a task assignee.");
      return;
    }

    if (
      assignedTo !== "ALL" &&
      !projectMembers.some((member) => member.email === assignedTo)
    ) {
      setValidationError("Please select a valid project member.");
      return;
    }

    if (!onCreate || loading) return;

    const payload = {
      title: title.trim(),
      description: description.trim(),
      priority,
      status: "todo",
      project,
      ...(assignedTo === "ALL"
        ? { assignToAll: true }
        : { assignedTo: [assignedTo] }),
      ...(dueDate && toSafeIso(dueDate)
        ? { dueDate: toSafeIso(dueDate) }
        : {}),
    };

    try {
      const created = await onCreate(payload);

      if (created) {
        setTitle("");
        setDescription("");
        setProject("");
        setPriority("low");
        setAssignedTo("");
        setDueDate(getDefaultDeadline());
        setValidationError("");
      }
    } catch (err) {
      console.error("Create task failed:", err);
    }
  };

  return (
    <section className="mt-10 rounded-2xl border border-white/10 bg-[#0e1222] p-6 text-white sm:p-8">
      <h2 className="text-2xl font-bold">Create a Task</h2>

      <p className="mt-2 text-sm text-slate-400">
        Add a task to one of your projects.
      </p>

      {projects.length === 0 ? (
        <p className="mt-5 rounded-xl bg-amber-500/10 p-4 text-sm text-amber-200">
          Create a project first before adding tasks.
        </p>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="mt-6 grid gap-5 sm:grid-cols-2"
        >
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Task title"
            maxLength={150}
            required
            className="w-full rounded-xl border border-white/10 bg-[#090d19] px-4 py-3 outline-none focus:border-indigo-500 sm:col-span-2"
          />

          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Task description"
            rows={3}
            className="w-full rounded-xl border border-white/10 bg-[#090d19] px-4 py-3 outline-none focus:border-indigo-500 sm:col-span-2"
          />

          <select
            value={project}
            onChange={(e) => {
              setProject(e.target.value);
              setAssignedTo("");
            }}
            required
            className="rounded-xl border border-white/10 bg-[#090d19] px-4 py-3"
          >
            <option value="">Select project</option>
            {projects.map((item) => (
              <option key={item._id || item.id} value={item._id || item.id}>
                {item.name}
              </option>
            ))}
          </select>

          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="rounded-xl border border-white/10 bg-[#090d19] px-4 py-3"
          >
            <option value="low">Low priority</option>
            <option value="medium">Medium priority</option>
            <option value="high">High priority</option>
          </select>

          <div className="sm:col-span-2">
            <label className="mb-2 block text-sm text-slate-300">
              Assign Task <span className="text-red-400">*</span>
            </label>

            <select
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              disabled={!project || projectMembers.length === 0}
              required
              className="w-full rounded-xl border border-white/10 bg-[#090d19] px-4 py-3 disabled:opacity-50"
            >
              <option value="">Select a member</option>

              {projectMembers.map((member) => (
                <option key={member._id} value={member.email}>
                  {member.name || member.email}
                </option>
              ))}

              {projectMembers.length > 0 && (
                <option value="ALL">Assign to All Project Members</option>
              )}
            </select>

            {project && projectMembers.length === 0 && (
              <p className="mt-2 text-sm text-amber-300">
                No project members found. Check that the project owner and
                members include their names and emails.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="dueDate" className="text-sm text-slate-300">
              Deadline (Date & Time)
            </label>

            <input
              id="dueDate"
              type="datetime-local"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-[#090d19] px-4 py-3 text-sm text-white"
            />
          </div>

          <div className="space-y-3 sm:col-span-2">
            <Alert message={validationError} />

            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-indigo-600 px-6 py-3 font-bold transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Creating..." : "+ Create Task"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

export default CreateTaskForm;
