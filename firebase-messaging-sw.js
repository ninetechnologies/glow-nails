// Firebase Cloud Messaging — Service Worker dédié
// Co-existe avec service-worker.js (PWA cache) sans conflit
// Scope automatique : /firebase-cloud-messaging-push-scope
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyB1R9I0KVkRNL7da3cOWUk9gIhqp0X0748",
  authDomain: "glow-nails-app.firebaseapp.com",
  projectId: "glow-nails-app",
  storageBucket: "glow-nails-app.firebasestorage.app",
  messagingSenderId: "789690603842",
  appId: "1:789690603842:web:a90759e8bb7edf66bcd0db"
});

const messaging = firebase.messaging();

// Background message handler — affiche la notif système quand l'app n'est pas focused
messaging.onBackgroundMessage((payload) => {
  console.log('[FCM SW] Background message:', payload);
  const title = payload.notification?.title || 'Glow Nails';
  const options = {
    body: payload.notification?.body || '',
    icon: '/web-app-manifest-192x192.png',
    badge: '/favicon-96x96.png',
    data: payload.data || {},
    tag: 'glow-nails-rdv'
  };
  return self.registration.showNotification(title, options);
});

// Click sur la notif → ouvrir l'app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow('https://glow-nails.vercel.app')
  );
});
