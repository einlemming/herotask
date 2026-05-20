import { useEffect, useRef, useState } from "react"
import {
  signIn,
  auth,
  db,
  clearSignInInProgress,
  isSignInInProgress,
  resolveRedirectSignIn,
} from "./firebase"
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  updateDoc,
  writeBatch,
} from "firebase/firestore"
import { onAuthStateChanged } from "firebase/auth"

type Priority = "high" | "medium" | "low"

type Task = {
  id: string
  title: string
  priority: Priority
  done: boolean
  carriedOver?: boolean
  carryCount?: number
}

export default function App() {
  const [uid, setUid] = useState<string | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [dayActionError, setDayActionError] = useState<string | null>(null)
  const [isAdvancingDay, setIsAdvancingDay] = useState(false)
  const [tasks, setTasks] = useState<Task[]>([])
  const [input, setInput] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  const deleteTask = async (id: string) => {
    if (!uid) return
    await deleteDoc(doc(db, "users", uid, "tasks", id))
  }

  useEffect(() => {
    let active = true
    let unsub = () => {}

    const initAuth = async () => {
      try {
        await resolveRedirectSignIn()
        await auth.authStateReady()
        if (!active) return

        const currentUser = auth.currentUser

        if (currentUser) {
          clearSignInInProgress()
          setUid(currentUser.uid)
        } else if (isSignInInProgress()) {
          clearSignInInProgress()
          setAuthError("Google sign-in returned without a session. Check Firebase authorized domains and browser cookie settings, then try again.")
        }

        setAuthReady(true)

        unsub = onAuthStateChanged(auth, (user) => {
          if (!active) return

          if (user) {
            clearSignInInProgress()
            setAuthError(null)
            setUid(user.uid)
          } else {
            setUid(null)
          }
        })
      } catch (error) {
        if (!active) return

        clearSignInInProgress()
        setAuthError(error instanceof Error ? error.message : "Google sign-in failed.")
        setAuthReady(true)
      }
    }

    void initAuth()

    return () => {
      active = false
      unsub()
    }
  }, [])

  useEffect(() => {
    if (!uid) return

    const q = collection(db, "users", uid, "tasks")
    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((taskDoc) => ({
        id: taskDoc.id,
        ...taskDoc.data(),
      })) as Task[]

      setTasks(data)
    })

    return () => unsub()
  }, [uid])

  const priorityOrder: Record<Priority, number> = {
    high: 0,
    medium: 1,
    low: 2,
  }

  const sortedTasks = [...tasks].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1
    return priorityOrder[a.priority] - priorityOrder[b.priority]
  })

  const parsePriority = (text: string): { priority: Priority; title: string } => {
    if (text.startsWith("!")) {
      return { priority: "high", title: text.slice(1).trim() }
    }
    if (text.startsWith(".")) {
      return { priority: "low", title: text.slice(1).trim() }
    }
    return { priority: "medium", title: text.trim() }
  }

  const newDay = async () => {
    if (!uid || isAdvancingDay) return

    setDayActionError(null)
    setIsAdvancingDay(true)

    try {
      const batch = writeBatch(db)

      tasks.forEach((task) => {
        const ref = doc(db, "users", uid, "tasks", task.id)

        if (task.done) {
          batch.delete(ref)
        } else {
          batch.update(ref, {
            carriedOver: true,
            carryCount: (task.carryCount ?? 0) + 1,
          })
        }
      })

      await batch.commit()
    } catch (error) {
      console.error("New Day commit failed", error)
      setDayActionError("Saving the new day failed. Please try again.")
    } finally {
      setIsAdvancingDay(false)
    }
  }

  const addTask = async () => {
    if (!input.trim() || tasks.length >= 7 || !uid) return

    const { priority, title } = parsePriority(input)

    await addDoc(collection(db, "users", uid, "tasks"), {
      title,
      priority,
      done: false,
      carryCount: 0,
    })

    setInput("")
    inputRef.current?.focus()
  }

  const toggleTask = async (id: string) => {
    if (!uid) return

    const ref = doc(db, "users", uid, "tasks", id)
    const task = tasks.find((item) => item.id === id)
    if (!task) return

    await updateDoc(ref, {
      done: !task.done,
    })
  }

  if (!uid) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
        <div className="w-full max-w-md rounded-2xl border bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-bold text-center">Hero Tasks</h1>
          <p className="mt-3 text-center text-sm text-gray-600">
            {authReady
              ? authError ?? "Sign in with Google to open your task board."
              : "Checking your Google session..."}
          </p>
          <button
            className="mt-6 w-full rounded-lg border border-blue-300 bg-blue-600 px-4 py-3 font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
            onClick={() => {
              setAuthError(null)
              void signIn()
            }}
            disabled={!authReady}
          >
            Sign in with Google
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex justify-center">
      <div className="w-full max-w-md p-6">
        <h1 className="text-2xl font-bold mb-2 text-center">Hero Tasks</h1>

        <Slots count={tasks.length} />

        <div className="flex gap-2 mb-6">
          <input
            ref={inputRef}
            className={`
              border rounded-lg p-2 flex-1 focus:outline-none focus:ring-2
              ${tasks.length >= 7 ? "border-red-400 bg-red-50" : "focus:ring-blue-400"}
            `}
            placeholder="New Task..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void addTask()}
          />
          <button
            className="px-4 rounded-lg border hover:bg-gray-100"
            onClick={() => void addTask()}
          >
            +
          </button>
        </div>

        <p className="mb-6 text-xs text-gray-500">
          <span className="mr-1" aria-hidden="true">ⓘ</span>
          Start with <span className="font-medium">!</span> for high priority or <span className="font-medium">.</span> for low priority.
        </p>

        <TaskList tasks={sortedTasks} onToggle={toggleTask} />

        {dayActionError && (
          <p className="mt-4 text-sm text-red-600">{dayActionError}</p>
        )}

        <button
          onClick={() => void newDay()}
          className="mt-6 w-full border rounded-lg p-2 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isAdvancingDay}
        >
          {isAdvancingDay ? "Saving..." : "New Day →"}
        </button>
      </div>
    </div>
  )

  function Slots({ count }: { count: number }) {
    return (
      <div className="flex gap-2 mb-4 justify-center">
        {[...Array(7)].map((_, i) => (
          <div
            key={i}
            className={`
              w-3 h-3 rounded-full transition-all
              ${i < count ? "bg-blue-400 scale-110" : "bg-gray-300"}
            `}
          />
        ))}
      </div>
    )
  }

  function TaskList({
    tasks,
    onToggle,
  }: {
    tasks: Task[]
    onToggle: (id: string) => void
  }) {
    return (
      <div className="space-y-2">
        {tasks.map((task) => (
          <div
            key={task.id}
            onClick={() => void onToggle(task.id)}
            className={`
              flex items-center gap-3 p-3 rounded-lg cursor-pointer
              border transition-all
              ${task.done ? "opacity-40 line-through" : "hover:bg-gray-100"}
            `}
          >
            <div
              className={`w-1 h-6 rounded ${
                task.priority === "high"
                  ? "bg-red-500"
                  : task.priority === "medium"
                    ? "bg-blue-400"
                    : "bg-gray-300"
              }`}
            />

            <div className="flex-1 text-left">{task.title}</div>

            {task.carryCount && task.carryCount > 0 && (
              <span className="text-xs text-yellow-500 ml-2">-&gt;{task.carryCount}</span>
            )}

            <button
              onClick={(e) => {
                e.stopPropagation()
                void deleteTask(task.id)
              }}
              className="text-gray-400 hover:text-red-500 text-lg px-2"
            >
              x
            </button>
          </div>
        ))}
      </div>
    )
  }
}
