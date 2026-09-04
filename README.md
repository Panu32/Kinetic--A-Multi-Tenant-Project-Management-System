<div align="center">

<h1><sup>💼</sup>Kinetic — Multi-Tenant Project Management<sub>📊</sub></h1>

Modern Full-Stack Project Management with Real-time Collaboration & Automated Notifications

![Version](https://img.shields.io/badge/version-1.0.0-success?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)

**Built with cutting-edge technologies for modern team collaboration:**

![React](https://img.shields.io/badge/React-19.1.1-61DAFB?style=flat-square&logo=react&logoColor=black)
![Express](https://img.shields.io/badge/Express-5.2.1-000000?style=flat-square&logo=express&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=node.js&logoColor=white)
![Clerk](https://img.shields.io/badge/Clerk-6C47FF?style=flat-square&logo=clerk&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-2D3748?style=flat-square&logo=prisma&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=flat-square&logo=tailwind-css&logoColor=white)

</div>

---

## 📋 Table of Contents

- [✨ Features](#-features)
- [🛠 Tech Stack](#-tech-stack)
- [🏗️ Project Structure](#-project-structure)
- [⚡ Getting Started](#-getting-started)
  - [Prerequisites](#prerequisites)
  - [Backend Setup](#backend-setup)
  - [Frontend Setup](#frontend-setup)
  - [Environment Variables](#environment-variables)
- [🗄️ Database Schema](#-database-schema)
- [📡 API Endpoints](#-api-endpoints)
- [🔄 Background Jobs](#-background-jobs)
- [🎨 UI/UX Features](#-uiux-features)
- [🚀 Deployment](#-deployment)
- [📊 Future Enhancements](#-future-enhancements)

---

## ✨ Features

### 🏢 Organization Management

- Create multiple organizations (workspaces)
- Invite and manage team members
- Role-based access control (ADMIN / MEMBER)
- Workspace isolation

### 📋 Project & Task Management

- Create and manage projects with priority, status, and date ranges
- Create tasks with assignees and due dates
- Task prioritization and categorization (TASK, BUG, FEATURE, IMPROVEMENT)
- Real-time project updates

### 🔔 Smart Notifications

- Email notifications for new task assignments
- Due date reminder emails (sent exactly at due date)
- Background job processing with Inngest
- Automatic retries on failure

### 👥 Team Collaboration

- Invite team members via email
- Assign tasks to project members
- Track team activity and performance
- Project analytics and insights with Recharts
- Calendar view for task scheduling

---

## 🛠 Tech Stack

### Frontend

![React](https://img.shields.io/badge/React-19.1.1-61DAFB?logo=react&logoColor=white)
![Redux Toolkit](https://img.shields.io/badge/Redux_Toolkit-2.8.2-764ABC?logo=redux&logoColor=white)
![React Router](https://img.shields.io/badge/React_Router-7.8.1-CA4245?logo=reactrouter&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.1.12-06B6D4?logo=tailwindcss&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-7.1.2-646CFF?logo=vite&logoColor=white)
![Axios](https://img.shields.io/badge/Axios-1.13.2-5A29E4?logo=axios&logoColor=white)

### Backend

![Node.js](https://img.shields.io/badge/Node.js-LTS-339933?logo=node.js&logoColor=white)
![Express.js](https://img.shields.io/badge/Express.js-5.2.1-000000?logo=express&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-6.19.1-2D3748?logo=prisma&logoColor=white)

### Services & APIs

![Clerk](https://img.shields.io/badge/Clerk-Auth-6C47FF?logo=clerk&logoColor=white)
![Inngest](https://img.shields.io/badge/Inngest-Background_Jobs-FF6B6B)
![Neon PostgreSQL](https://img.shields.io/badge/Neon-PostgreSQL-00E599?logo=neon&logoColor=white)

---

## 🏗️ Project Structure

```
kinetic/
├── 📁 client/                    # React Frontend
│   ├── src/
│   │   ├── app/
│   │   │   └── store.js         # Redux store configuration
│   │   ├── assets/              # Static assets
│   │   ├── components/          # Reusable React components
│   │   ├── configs/             # API config (axios instance)
│   │   ├── features/            # Redux slices
│   │   ├── pages/               # Application pages
│   │   ├── App.jsx              # Main App component
│   │   ├── index.css            # Global styles
│   │   └── main.jsx             # Entry point
│   ├── .env                     # Environment variables
│   ├── package.json             # Frontend dependencies
│   └── vite.config.js           # Vite configuration
│
├── 📁 server/                   # Express Backend
│   ├── configs/                 # Prisma & Nodemailer config
│   ├── controllers/             # Route controllers
│   ├── inngest/                 # Background job functions
│   ├── middlewares/             # Auth middleware (Clerk)
│   ├── prisma/                  # Database schema
│   ├── routes/                  # API routes
│   ├── .env                     # Server environment variables
│   ├── package.json             # Backend dependencies
│   └── server.js               # Server entry point
│
├── LICENSE
└── README.md
```

---

## ⚡ Getting Started

### Prerequisites

- Node.js (v18 or higher)
- PostgreSQL (or [Neon](https://neon.tech) account)
- [Clerk](https://clerk.com) account for authentication
- [Inngest](https://inngest.com) account for background jobs

### Backend Setup

```bash
cd server
npm install
cp .env.example .env
# Configure your environment variables
npm run server
```

### Frontend Setup

```bash
cd client
npm install
cp .env.example .env
# Configure your environment variables
npm run dev
```

### Environment Variables

**Server (`.env`):**

```env
DATABASE_URL="neon_postgresql_connection_string"
DIRECT_URL="neon_direct_connection_string"
CLERK_SECRET_KEY="your_clerk_secret_key"
INNGEST_EVENT_KEY="your_inngest_event_key"
EMAIL_HOST="smtp.gmail.com"
EMAIL_PORT=587
EMAIL_USER="your_email@gmail.com"
EMAIL_PASS="your_app_password"
```

**Client (`.env`):**

```env
VITE_CLERK_PUBLISHABLE_KEY="your_clerk_publishable_key"
VITE_API_URL="http://localhost:5000"
```

---

## 🗄️ Database Schema

The application uses **Neon PostgreSQL** with **Prisma ORM**. Core models:

| Model | Description |
|---|---|
| `User` | Synced from Clerk via webhook |
| `Workspace` | Multi-tenant workspace/org entity |
| `WorkspaceMember` | User ↔ Workspace with ADMIN/MEMBER role |
| `Project` | Projects within a workspace |
| `ProjectMember` | User ↔ Project membership |
| `Task` | Individual tasks with assignee & due date |
| `Comment` | Comments on tasks |

---

## 📡 API Endpoints

### Authentication
All routes are protected by Clerk JWT via the `protect` middleware.

### Workspaces
- `GET /api/workspaces` — List user's workspaces
- `POST /api/workspaces/invite` — Invite member to workspace

### Projects
- `POST /api/projects` — Create new project
- `PUT /api/projects` — Update project
- `POST /api/projects/:id/member` — Add member to project

### Tasks
- `POST /api/tasks` — Create new task
- `PUT /api/tasks/:id` — Update task
- `DELETE /api/tasks` — Delete tasks (bulk)

### Comments
- `POST /api/comments` — Add comment to task
- `GET /api/comments/:taskId` — Get comments for a task

---

## 🔄 Background Jobs

Powered by **Inngest** for reliable, retryable background processing:

| Function | Trigger | Action |
|---|---|---|
| `sync-user-from-clerk` | `clerk/user.created` | Create user in DB |
| `update-user-from-clerk` | `clerk/user.updated` | Update user in DB |
| `delete-user-with-clerk` | `clerk/user.deleted` | Delete user from DB |
| `sync-workspace-from-clerk` | `clerk/organization.created` | Create workspace + ADMIN member |
| `update-workspace-from-clerk` | `clerk/organization.updated` | Sync workspace changes |
| `delete-workspace-with-clerk` | `clerk/organization.deleted` | Remove workspace from DB |
| `sync-workspace-member-from-clerk` | `clerk/organizationInvitation.accepted` | Add member to workspace |
| `send-task-assignment-email` | `app/task.assigned` | Email assignee + schedule due-date reminder |

---

## 🎨 UI/UX Features

- **Responsive Design** — Works on all screen sizes
- **Dark/Light Mode** — Theme toggle
- **Charts & Analytics** — Project insights with Recharts
- **Calendar View** — Task scheduling and due dates
- **Real-time State** — Optimistic Redux updates

---

## 🚀 Deployment

Both client and server are configured for **Vercel** deployment via `vercel.json`.

- **Database**: Neon PostgreSQL (serverless, auto-scaling)
- **Auth**: Clerk (handles OAuth, sessions, org management)
- **Background Jobs**: Inngest (cloud-hosted, retryable)

---

## 📊 Future Enhancements

- [ ] File attachments for tasks
- [ ] Time tracking
- [ ] Gantt chart visualization
- [ ] Mobile application
- [ ] Slack / GitHub integrations
- [ ] Advanced reporting and CSV exports

---

## 📝 License

This project is licensed under the **MIT License** — see the [LICENSE](./LICENSE) file for details.

---

<div align="center">

**Built with ❤️ using modern web technologies 🚀**

_Streamline your team's workflow with powerful project management tools_

[⬆ Back to Top](#-table-of-contents)

</div>
