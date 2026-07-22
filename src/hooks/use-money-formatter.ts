"use client";
import { useCallback } from "react";
import { formatMoney } from "@/domain/money";
export function useMoneyFormatter(){ return useCallback((amountMinor:number)=>formatMoney(amountMinor),[]); }
