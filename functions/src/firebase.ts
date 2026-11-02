// Centralized place to import firebase stuff for tests and stuff

import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = getApps()[0] ?? initializeApp();
export const db = getFirestore(app);