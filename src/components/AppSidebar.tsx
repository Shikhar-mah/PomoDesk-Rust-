// The application sidebar: Timer, To-do views/lists, Statistics, Settings.
//
// One markup tree is used for the expanded sidebar and the icon rail (CSS hides
// labels at medium widths). On narrow windows the same content is rendered in a
// left-anchored modal drawer.

import type { ReactNode } from "react";

import { cn } from "../lib/cn";
import type { TodoList, TodoView } from "../lib/types";
import { useNavigationStore } from "../stores/navigation";
import { useTodoStore } from "../stores/todos";
import { Dialog } from "./ui/Dialog";
import {
  ArchiveIcon,
  BookIcon,
  BriefcaseIcon,
  ChartIcon,
  HeartIcon,
  InboxIcon,
  ListIcon,
  PlusIcon,
  SettingsIcon,
  TargetIcon,
  UserIcon,
} from "./ui/Icon";
import { Menu } from "./ui/Menu";

interface AppSidebarProps {
  onOpenStats: () => void;
  onOpenSettings: () => void;
  onNewList: () => void;
  onEditList: (list: TodoList) => void;
}

const VIEWS: Array<{ view: TodoView; label: string }> = [
  { view: "all", label: "All tasks" },
  { view: "today", label: "Today" },
  { view: "upcoming", label: "Upcoming" },
  { view: "overdue", label: "Overdue" },
  { view: "completed", label: "Completed" },
];

const LIST_ICONS: Record<string, (props: { className?: string }) => ReactNode> = {
  list: ListIcon,
  inbox: InboxIcon,
  briefcase: BriefcaseIcon,
  user: UserIcon,
  book: BookIcon,
  heart: HeartIcon,
};

function ListGlyph({ list }: { list: TodoList }) {
  const Glyph = LIST_ICONS[list.icon] ?? ListIcon;
  return (
    <span className="app-nav__icon list-glyph" data-color={list.color}>
      <Glyph />
    </span>
  );
}

export function AppSidebar({
  onOpenStats,
  onOpenSettings,
  onNewList,
  onEditList,
}: AppSidebarProps) {
  const section = useNavigationStore((state) => state.section);
  const todoView = useNavigationStore((state) => state.todoView);
  const listId = useNavigationStore((state) => state.listId);
  const sidebarOpen = useNavigationStore((state) => state.sidebarOpen);
  const setSection = useNavigationStore((state) => state.setSection);
  const openView = useNavigationStore((state) => state.openView);
  const openList = useNavigationStore((state) => state.openList);
  const setSidebarOpen = useNavigationStore((state) => state.setSidebarOpen);

  const lists = useTodoStore((state) => state.lists);
  const todos = useTodoStore((state) => state.todos);
  const todoError = useTodoStore((state) => state.error);

  const activeLists = lists.filter((list) => list.archivedAt === null);
  const archivedCount = lists.filter((list) => list.archivedAt !== null).length;
  const openCount = (target: number) =>
    todos.filter((todo) => todo.listId === target && !todo.isDone).length;

  function navItems() {
    return (
      <div className="app-sidebar__nav">
        <button
          type="button"
          className="app-nav__item"
          aria-current={section === "timer" ? "page" : undefined}
          onClick={() => setSection("timer")}
        >
          <span className="app-nav__icon">
            <TargetIcon />
          </span>
          <span className="app-nav__label">Timer</span>
        </button>
        <button
          type="button"
          className="app-nav__item"
          aria-current={section === "todos" ? "page" : undefined}
          onClick={() => openView("all")}
        >
          <span className="app-nav__icon">
            <ListIcon />
          </span>
          <span className="app-nav__label">To-do</span>
        </button>

        <div className="app-sidebar__group app-sidebar__views" aria-label="To-do views">
          {VIEWS.map((entry) => (
            <button
              key={entry.view}
              type="button"
              className="app-nav__child"
              aria-current={
                section === "todos" && todoView === entry.view ? "page" : undefined
              }
              onClick={() => openView(entry.view)}
            >
              <span className="app-nav__label">{entry.label}</span>
            </button>
          ))}
        </div>

        <div className="app-sidebar__group app-sidebar__lists" aria-label="To-do lists">
          <p className="app-sidebar__heading">Lists</p>
          {activeLists.map((list) => (
            <div key={list.id} className="app-list-row">
              <button
                type="button"
                className="app-nav__child app-nav__child--list"
                aria-current={
                  section === "todos" && todoView === "list" && listId === list.id
                    ? "page"
                    : undefined
                }
                onClick={() => openList(list.id)}
                title={list.name}
              >
                <ListGlyph list={list} />
                <span className="app-nav__label max-w-[120px] truncate">{list.name}</span>
                <span className="app-nav__count">{openCount(list.id)}</span>
              </button>

              <Menu
                label={`List actions for "${list.name}"`}
                className="app-list-row__menu"
                items={[
                  { label: "Rename or recolour", onSelect: () => onEditList(list) },
                  {
                    label: "Move up",
                    onSelect: () => void useTodoStore.getState().moveList(list.id, "up"),
                  },
                  {
                    label: "Move down",
                    onSelect: () => void useTodoStore.getState().moveList(list.id, "down"),
                  },
                  {
                    label: "Archive",
                    onSelect: () =>
                      void useTodoStore.getState().setListArchived(list.id, true),
                    disabled: list.isInbox,
                  },
                ]}
              />
            </div>
          ))}

          <button type="button" className="app-nav__child app-nav__add" onClick={onNewList}>
            <span className="app-nav__icon">
              <PlusIcon />
            </span>
            <span className="app-nav__label">New list</span>
          </button>

          <button
            type="button"
            className="app-nav__child"
            aria-current={
              section === "todos" && todoView === "archived" ? "page" : undefined
            }
            onClick={() => openView("archived")}
          >
            <span className="app-nav__icon">
              <ArchiveIcon />
            </span>
            <span className="app-nav__label">Archived</span>
            {archivedCount > 0 ? (
              <span className="app-nav__count">{archivedCount}</span>
            ) : null}
          </button>
        </div>

        {todoError ? <p className="app-sidebar__hint">{todoError}</p> : null}

        <div className="app-sidebar__group app-sidebar__tools">
          <button
            type="button"
            className="app-nav__item"
            onClick={onOpenStats}
          >
            <span className="app-nav__icon">
              <ChartIcon />
            </span>
            <span className="app-nav__label">Statistics</span>
          </button>
          <button
            type="button"
            className="app-nav__item"
            onClick={onOpenSettings}
          >
            <span className="app-nav__icon">
              <SettingsIcon />
            </span>
            <span className="app-nav__label">Settings</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <aside className={cn("app-sidebar")} aria-label="Main navigation">
        <div className="app-sidebar__brand">
          <span className="app-sidebar__mark">P</span>
          <span className="app-sidebar__brand-name">PomoDesk</span>
        </div>
        {navItems()}
      </aside>

      {sidebarOpen ? (
        <Dialog
          open
          title="Navigation"
          onClose={() => setSidebarOpen(false)}
          className="dialog--drawer"
        >
          {navItems()}
        </Dialog>
      ) : null}
    </>
  );
}
