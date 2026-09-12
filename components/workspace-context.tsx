"use client";
import { createContext, useContext } from "react";
export const WorkspaceTimeZone = createContext("UTC");
export const useWorkspaceTimeZone = () => useContext(WorkspaceTimeZone);
