export { db } from "@/lib/firebaseClient";

// Re-export firestore functions from ONE place to avoid mixing modules
export {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";