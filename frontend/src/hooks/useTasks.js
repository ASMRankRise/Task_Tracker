
import { useCallback, useEffect, useRef, useState } from "react";
import api from "../services/api";

function useTasks(user, initialOptions = {}) {
  const userId = user?._id || user?.id || user?.userId;
  const initialLimit = initialOptions.limit || 50;

  const [tasks, setTasks] = useState([]);
  const [search, setSearchValue] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilterValue] = useState("");
  const [priorityFilter, setPriorityFilterValue] = useState("");
  const [projectFilter, setProjectFilterValue] = useState(initialOptions.projectId || "");
  const [assigneeFilter, setAssigneeFilterValue] = useState("");
  const [page, setPageValue] = useState(1);
  const [limit, setLimitValue] = useState(initialLimit);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const requestId = useRef(0);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearch(search);
    }, 400);

    return () => clearTimeout(timeout);
  }, [search]);

  const setSearch = (value) => {
    setSearchValue(value);
    setPageValue(1);
  };

  const setStatusFilter = (value) => {
    setStatusFilterValue(value);
    setPageValue(1);
  };

  const setPriorityFilter = (value) => {
    setPriorityFilterValue(value);
    setPageValue(1);
  };

  const setProjectFilter = (value) => {
    setProjectFilterValue(value);
    setPageValue(1);
  };

  const setAssigneeFilter = (value) => {
    setAssigneeFilterValue(value);
    setPageValue(1);
  };

  const setLimit = (value) => {
    setLimitValue(value);
    setPageValue(1);
  };

  const setPage = (value) => {
    setPageValue((currentPage) =>
      typeof value === "function" ? value(currentPage) : value,
    );
  };

  const fetchTasks = useCallback(async (customPage, customLimit) => {
    if (!userId) return false;

    const currentRequestId = ++requestId.current;
    const targetPage = typeof customPage === "number" ? customPage : page;
    const targetLimit = typeof customLimit === "number" ? customLimit : limit;

    const params = { page: targetPage, limit: targetLimit };

    if (debouncedSearch.trim()) {
      params.search = debouncedSearch.trim();
    }

    if (statusFilter) params.status = statusFilter;
    if (priorityFilter) params.priority = priorityFilter;
    if (projectFilter) params.project = projectFilter;
    if (assigneeFilter) {
      params.assignedTo = assigneeFilter === "me" ? userId : assigneeFilter;
    }

    setLoading(true);
    setError("");

    try {
      const response = await api.get("/tasks", { params });

      if (currentRequestId !== requestId.current) return false;

      const data = response.data;
      const fetchedTasks = data.tasks || [];
      const fetchedTotal = data.totalTasks ?? data.total ?? 0;
      const fetchedTotalPages = Math.max(
        1,
        data.totalPages || Math.ceil(fetchedTotal / targetLimit) || 1,
      );

      if (targetPage > fetchedTotalPages && fetchedTotal > 0) {
        setPageValue(fetchedTotalPages);

        const fallbackRes = await api.get("/tasks", {
          params: { ...params, page: fetchedTotalPages },
        });

        if (currentRequestId !== requestId.current) return false;

        const fallbackData = fallbackRes.data;
        setTasks(fallbackData.tasks || []);
        setTotal(fallbackData.totalTasks ?? fallbackData.total ?? fetchedTotal);
        setTotalPages(fallbackData.totalPages ?? fetchedTotalPages);

        return true;
      }

      setTasks(fetchedTasks);
      setTotal(fetchedTotal);
      setTotalPages(fetchedTotalPages);

      return true;
    } catch (err) {
      if (currentRequestId === requestId.current) {
        setError(err.response?.data?.message || "Failed to fetch tasks.");
      }

      return false;
    } finally {
      if (currentRequestId === requestId.current) {
        setLoading(false);
      }
    }
  }, [
    userId,
    page,
    limit,
    debouncedSearch,
    statusFilter,
    priorityFilter,
    projectFilter,
    assigneeFilter,
  ]);

  const createTask = async (payload) => {
    setError("");
    setSuccess("");

    if (Array.isArray(payload)) {
      if (payload.length === 0) {
        return { success: false, error: "No tasks to create." };
      }
      if (payload.length === 1) {
        return await createTask(payload[0]);
      }
      const res = await createTasks(payload);
      return {
        ...res,
        task: res.results?.[0]?.task,
        error: res.results?.find((r) => !r.success)?.error || res.error,
      };
    }

    try {
      const response = await api.post("/tasks", payload);

      setSuccess("Task created successfully!");
      await fetchTasks();

      return { success: true, task: response.data?.task };
    } catch (err) {
      const msg = err.response?.data?.message || "Failed to create task.";
      setError(msg);

      return { success: false, error: msg };
    }
  };

  const createTasks = async (payloads) => {
    setError("");
    setSuccess("");

    const taskPayloads = (
      Array.isArray(payloads) ? payloads.flat(Infinity) : [payloads]
    ).filter(Boolean);

    if (!taskPayloads.length) {
      setError("No tasks to create.");
      return { success: false, results: [] };
    }

    const results = await Promise.allSettled(
      taskPayloads.map((payload) => api.post("/tasks", payload)),
    );

    const taskResults = results.map((result) =>
      result.status === "fulfilled"
        ? {
          success: true,
          task: result.value.data?.task,
        }
        : {
          success: false,
          error:
            result.reason?.response?.data?.message ||
            "Failed to create task.",
        },
    );

    const successCount = taskResults.filter((result) => result.success).length;
    const failedCount = taskResults.length - successCount;

    if (successCount > 0) {
      setSuccess(`${successCount} task(s) created successfully!`);
      await fetchTasks();
    }

    if (failedCount > 0) {
      setError(`${failedCount} task(s) could not be created.`);
    }

    return {
      success: failedCount === 0,
      results: taskResults,
    };
  };

  const updateTask = async (taskId, changes) => {
    setError("");
    setSuccess("");

    try {
      const response = await api.patch(`/tasks/${taskId}`, changes);
      setSuccess("Task updated successfully!");

      const updated = response.data?.task;

      if (updated) {
        const upId = String(updated._id || updated.id);

        setTasks((prev) =>
          prev.map((t) =>
            String(t._id || t.id) === upId ? { ...t, ...updated } : t,
          ),
        );
      }

      await fetchTasks();

      return { success: true, task: updated };
    } catch (err) {
      const msg = err.response?.data?.message || "Failed to update task.";
      setError(msg);

      return { success: false, error: msg };
    }
  };

  const deleteTask = async (taskId) => {
    setError("");
    setSuccess("");

    try {
      await api.delete(`/tasks/${taskId}`);
      setSuccess("Task deleted successfully!");

      if (tasks.length === 1 && page > 1) {
        const prevPage = page - 1;
        setPageValue(prevPage);
        await fetchTasks(prevPage);
      } else {
        await fetchTasks();
      }

      return { success: true };
    } catch (err) {
      const msg = err.response?.data?.message || "Failed to delete task.";
      setError(msg);

      return { success: false, error: msg };
    }
  };

  return {
    tasks,
    allTasks: tasks,
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    priorityFilter,
    setPriorityFilter,
    projectFilter,
    setProjectFilter,
    assigneeFilter,
    setAssigneeFilter,
    page,
    setPage,
    limit,
    setLimit,
    totalPages,
    total,
    loading,
    error,
    success,
    setError,
    setSuccess,
    fetchTasks,
    createTask,
    createTasks,
    updateTask,
    deleteTask,
  };
}

export default useTasks;
