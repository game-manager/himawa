import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: 'AIzaSyA09CgPDfd8mCq_ZKxi2W9vxPgm705munM',
  authDomain: 'himawa-social-2026.firebaseapp.com',
  projectId: 'himawa-social-2026',
  storageBucket: 'himawa-social-2026.firebasestorage.app',
  messagingSenderId: '423756733372',
  appId: '1:423756733372:web:a19bb35b6370c24ec569b9',
}

export const firebaseApp = initializeApp(firebaseConfig)
export const auth = getAuth(firebaseApp)
export const db = getFirestore(firebaseApp)
