export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      accounting_opening_snapshot: {
        Row: {
          amount: number
          company_id: string | null
          entity_id: string | null
          entity_kind: string
          id: string
          quantity: number | null
          snapshot_key: string
          source_table: string
          taken_at: string
        }
        Insert: {
          amount?: number
          company_id?: string | null
          entity_id?: string | null
          entity_kind: string
          id?: string
          quantity?: number | null
          snapshot_key: string
          source_table: string
          taken_at?: string
        }
        Update: {
          amount?: number
          company_id?: string | null
          entity_id?: string | null
          entity_kind?: string
          id?: string
          quantity?: number | null
          snapshot_key?: string
          source_table?: string
          taken_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounting_opening_snapshot_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_audit_log: {
        Row: {
          action: string
          created_at: string
          duration_ms: number | null
          error: string | null
          feature: string
          id: string
          meta: Json | null
          model: string | null
          prompt_summary: string | null
          ref_id: string | null
          ref_table: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          action?: string
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          feature: string
          id?: string
          meta?: Json | null
          model?: string | null
          prompt_summary?: string | null
          ref_id?: string | null
          ref_table?: string | null
          status?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          feature?: string
          id?: string
          meta?: Json | null
          model?: string | null
          prompt_summary?: string | null
          ref_id?: string | null
          ref_table?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: []
      }
      ai_conversations: {
        Row: {
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_document_chunks: {
        Row: {
          chunk_index: number
          content: string
          created_at: string
          document_id: string
          embedding: string | null
          id: string
        }
        Insert: {
          chunk_index: number
          content: string
          created_at?: string
          document_id: string
          embedding?: string | null
          id?: string
        }
        Update: {
          chunk_index?: number
          content?: string
          created_at?: string
          document_id?: string
          embedding?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_document_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "ai_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_documents: {
        Row: {
          company_id: string | null
          content_text: string | null
          created_at: string
          doc_kind: string
          extraction: Json | null
          extraction_error: string | null
          extraction_status: string
          file_name: string | null
          id: string
          mime_type: string | null
          party_id: string | null
          quotation_group: string | null
          storage_path: string | null
          supplier_id: string | null
          title: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          company_id?: string | null
          content_text?: string | null
          created_at?: string
          doc_kind?: string
          extraction?: Json | null
          extraction_error?: string | null
          extraction_status?: string
          file_name?: string | null
          id?: string
          mime_type?: string | null
          party_id?: string | null
          quotation_group?: string | null
          storage_path?: string | null
          supplier_id?: string | null
          title: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          company_id?: string | null
          content_text?: string | null
          created_at?: string
          doc_kind?: string
          extraction?: Json | null
          extraction_error?: string | null
          extraction_status?: string
          file_name?: string | null
          id?: string
          mime_type?: string | null
          party_id?: string | null
          quotation_group?: string | null
          storage_path?: string | null
          supplier_id?: string | null
          title?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_documents_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_documents_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "party_outstanding"
            referencedColumns: ["party_id"]
          },
          {
            foreignKeyName: "ai_documents_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_insights: {
        Row: {
          company_id: string | null
          created_by: string | null
          expires_at: string | null
          generated_at: string
          id: string
          kind: string
          model: string | null
          payload: Json
          scope_key: string
        }
        Insert: {
          company_id?: string | null
          created_by?: string | null
          expires_at?: string | null
          generated_at?: string
          id?: string
          kind: string
          model?: string | null
          payload: Json
          scope_key?: string
        }
        Update: {
          company_id?: string | null
          created_by?: string | null
          expires_at?: string | null
          generated_at?: string
          id?: string
          kind?: string
          model?: string | null
          payload?: Json
          scope_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_insights_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          data: Json | null
          id: string
          role: string
          user_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          data?: Json | null
          id?: string
          role: string
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          data?: Json | null
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_proposals: {
        Row: {
          applied_id: string | null
          applied_table: string | null
          created_at: string
          created_by: string | null
          id: string
          kind: string
          payload: Json
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source_document_id: string | null
          status: string
          summary: string
          updated_at: string
        }
        Insert: {
          applied_id?: string | null
          applied_table?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kind: string
          payload: Json
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_document_id?: string | null
          status?: string
          summary: string
          updated_at?: string
        }
        Update: {
          applied_id?: string | null
          applied_table?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          payload?: Json
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_document_id?: string | null
          status?: string
          summary?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_proposals_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "ai_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          attendance_date: string
          company_id: string | null
          created_at: string
          employee_id: string
          first_in: string | null
          hours_worked: number | null
          id: string
          in_time: string | null
          is_early_exit: boolean
          is_half_day: boolean
          is_late: boolean
          last_out: string | null
          notes: string | null
          ot_hours: number
          out_time: string | null
          status: Database["public"]["Enums"]["attendance_status"]
        }
        Insert: {
          attendance_date: string
          company_id?: string | null
          created_at?: string
          employee_id: string
          first_in?: string | null
          hours_worked?: number | null
          id?: string
          in_time?: string | null
          is_early_exit?: boolean
          is_half_day?: boolean
          is_late?: boolean
          last_out?: string | null
          notes?: string | null
          ot_hours?: number
          out_time?: string | null
          status?: Database["public"]["Enums"]["attendance_status"]
        }
        Update: {
          attendance_date?: string
          company_id?: string | null
          created_at?: string
          employee_id?: string
          first_in?: string | null
          hours_worked?: number | null
          id?: string
          in_time?: string | null
          is_early_exit?: boolean
          is_half_day?: boolean
          is_late?: boolean
          last_out?: string | null
          notes?: string | null
          ot_hours?: number
          out_time?: string | null
          status?: Database["public"]["Enums"]["attendance_status"]
        }
        Relationships: [
          {
            foreignKeyName: "attendance_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_accounts: {
        Row: {
          account_number: string
          account_type: string
          bank_name: string
          branch: string | null
          cheque_print_template: Json | null
          company_id: string | null
          created_at: string
          currency_code: string
          id: string
          ifsc_code: string | null
          is_active: boolean
          ledger_account_id: string | null
          name: string
          notes: string | null
          opening_balance: number
          opening_balance_date: string
          updated_at: string
        }
        Insert: {
          account_number: string
          account_type?: string
          bank_name: string
          branch?: string | null
          cheque_print_template?: Json | null
          company_id?: string | null
          created_at?: string
          currency_code?: string
          id?: string
          ifsc_code?: string | null
          is_active?: boolean
          ledger_account_id?: string | null
          name: string
          notes?: string | null
          opening_balance?: number
          opening_balance_date?: string
          updated_at?: string
        }
        Update: {
          account_number?: string
          account_type?: string
          bank_name?: string
          branch?: string | null
          cheque_print_template?: Json | null
          company_id?: string | null
          created_at?: string
          currency_code?: string
          id?: string
          ifsc_code?: string | null
          is_active?: boolean
          ledger_account_id?: string | null
          name?: string
          notes?: string | null
          opening_balance?: number
          opening_balance_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_accounts_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "bank_accounts_ledger_account_id_fkey"
            columns: ["ledger_account_id"]
            isOneToOne: false
            referencedRelation: "ledger_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_accounts_ledger_account_id_fkey"
            columns: ["ledger_account_id"]
            isOneToOne: false
            referencedRelation: "ledger_balances"
            referencedColumns: ["ledger_id"]
          },
        ]
      }
      bank_transactions: {
        Row: {
          balance: number | null
          bank_account_id: string
          bank_date: string | null
          created_at: string
          created_by: string | null
          credit: number
          debit: number
          description: string | null
          id: string
          reconciled_at: string | null
          reconciled_with: string | null
          reference: string | null
          source: string
          txn_date: string
          value_date: string | null
          voucher_id: string | null
        }
        Insert: {
          balance?: number | null
          bank_account_id: string
          bank_date?: string | null
          created_at?: string
          created_by?: string | null
          credit?: number
          debit?: number
          description?: string | null
          id?: string
          reconciled_at?: string | null
          reconciled_with?: string | null
          reference?: string | null
          source?: string
          txn_date: string
          value_date?: string | null
          voucher_id?: string | null
        }
        Update: {
          balance?: number | null
          bank_account_id?: string
          bank_date?: string | null
          created_at?: string
          created_by?: string | null
          credit?: number
          debit?: number
          description?: string | null
          id?: string
          reconciled_at?: string | null
          reconciled_with?: string | null
          reference?: string | null
          source?: string
          txn_date?: string
          value_date?: string | null
          voucher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_transactions_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_reconciled_with_fkey"
            columns: ["reconciled_with"]
            isOneToOne: false
            referencedRelation: "bank_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
      bill_allocations: {
        Row: {
          allocation_date: string
          allocation_type: string
          amount: number
          bill_id: string
          company_id: string | null
          created_at: string
          created_by: string | null
          currency_code: string
          effect: number
          id: string
          idempotency_key: string | null
          reverses_allocation_id: string | null
          settlement_voucher_entry_id: string | null
          settlement_voucher_id: string | null
        }
        Insert: {
          allocation_date?: string
          allocation_type: string
          amount: number
          bill_id: string
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          currency_code?: string
          effect?: number
          id?: string
          idempotency_key?: string | null
          reverses_allocation_id?: string | null
          settlement_voucher_entry_id?: string | null
          settlement_voucher_id?: string | null
        }
        Update: {
          allocation_date?: string
          allocation_type?: string
          amount?: number
          bill_id?: string
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          currency_code?: string
          effect?: number
          id?: string
          idempotency_key?: string | null
          reverses_allocation_id?: string | null
          settlement_voucher_entry_id?: string | null
          settlement_voucher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bill_allocations_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_allocations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_allocations_reverses_allocation_id_fkey"
            columns: ["reverses_allocation_id"]
            isOneToOne: false
            referencedRelation: "bill_allocations"
            referencedColumns: ["id"]
          },
        ]
      }
      bills: {
        Row: {
          bill_date: string
          bill_reference: string | null
          cancelled_on: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          currency_code: string
          due_date: string | null
          external_ref: string | null
          id: string
          ledger_account_id: string | null
          original_amount: number
          party_id: string | null
          party_kind: string
          reference_type: string
          source_invoice_id: string | null
          source_voiding_voucher_id: string | null
          source_voucher_entry_id: string | null
          source_voucher_id: string | null
          status: string
          supplier_id: string | null
          updated_at: string
        }
        Insert: {
          bill_date?: string
          bill_reference?: string | null
          cancelled_on?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          currency_code?: string
          due_date?: string | null
          external_ref?: string | null
          id?: string
          ledger_account_id?: string | null
          original_amount: number
          party_id?: string | null
          party_kind: string
          reference_type?: string
          source_invoice_id?: string | null
          source_voiding_voucher_id?: string | null
          source_voucher_entry_id?: string | null
          source_voucher_id?: string | null
          status?: string
          supplier_id?: string | null
          updated_at?: string
        }
        Update: {
          bill_date?: string
          bill_reference?: string | null
          cancelled_on?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          currency_code?: string
          due_date?: string | null
          external_ref?: string | null
          id?: string
          ledger_account_id?: string | null
          original_amount?: number
          party_id?: string | null
          party_kind?: string
          reference_type?: string
          source_invoice_id?: string | null
          source_voiding_voucher_id?: string | null
          source_voucher_entry_id?: string | null
          source_voucher_id?: string | null
          status?: string
          supplier_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bills_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_source_voiding_voucher_id_fkey"
            columns: ["source_voiding_voucher_id"]
            isOneToOne: false
            referencedRelation: "vouchers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      cheques: {
        Row: {
          amount: number
          bank_account_id: string | null
          bank_name: string | null
          branch: string | null
          cheque_date: string
          cheque_number: string
          cleared_date: string | null
          created_at: string
          created_by: string | null
          direction: string
          id: string
          invoice_id: string | null
          narration: string | null
          party_id: string | null
          party_name: string
          purchase_bill_id: string | null
          status: string
          supplier_id: string | null
          updated_at: string
          voucher_id: string | null
        }
        Insert: {
          amount: number
          bank_account_id?: string | null
          bank_name?: string | null
          branch?: string | null
          cheque_date: string
          cheque_number: string
          cleared_date?: string | null
          created_at?: string
          created_by?: string | null
          direction: string
          id?: string
          invoice_id?: string | null
          narration?: string | null
          party_id?: string | null
          party_name: string
          purchase_bill_id?: string | null
          status?: string
          supplier_id?: string | null
          updated_at?: string
          voucher_id?: string | null
        }
        Update: {
          amount?: number
          bank_account_id?: string | null
          bank_name?: string | null
          branch?: string | null
          cheque_date?: string
          cheque_number?: string
          cleared_date?: string | null
          created_at?: string
          created_by?: string | null
          direction?: string
          id?: string
          invoice_id?: string | null
          narration?: string | null
          party_id?: string | null
          party_name?: string
          purchase_bill_id?: string | null
          status?: string
          supplier_id?: string | null
          updated_at?: string
          voucher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cheques_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cheques_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cheques_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cheques_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "party_outstanding"
            referencedColumns: ["party_id"]
          },
          {
            foreignKeyName: "cheques_purchase_bill_id_fkey"
            columns: ["purchase_bill_id"]
            isOneToOne: false
            referencedRelation: "purchase_bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cheques_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cheques_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address: string | null
          base_currency: string
          code: string
          country: string
          created_at: string
          created_by: string | null
          currency_symbol: string
          display_name: string
          financial_year_start_day: number
          financial_year_start_month: number
          gstin: string | null
          id: string
          is_active: boolean
          is_default: boolean
          legal_name: string
          mailing_name: string | null
          pan: string | null
          state: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          base_currency?: string
          code: string
          country?: string
          created_at?: string
          created_by?: string | null
          currency_symbol?: string
          display_name: string
          financial_year_start_day?: number
          financial_year_start_month?: number
          gstin?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          legal_name: string
          mailing_name?: string | null
          pan?: string | null
          state?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          base_currency?: string
          code?: string
          country?: string
          created_at?: string
          created_by?: string | null
          currency_symbol?: string
          display_name?: string
          financial_year_start_day?: number
          financial_year_start_month?: number
          gstin?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          legal_name?: string
          mailing_name?: string | null
          pan?: string | null
          state?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      cost_centers: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          parent_id: string | null
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          parent_id?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          parent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cost_centers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_centers_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      currencies: {
        Row: {
          code: string
          created_at: string
          is_active: boolean
          is_base: boolean
          name: string
          symbol: string | null
        }
        Insert: {
          code: string
          created_at?: string
          is_active?: boolean
          is_base?: boolean
          name: string
          symbol?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          is_active?: boolean
          is_base?: boolean
          name?: string
          symbol?: string | null
        }
        Relationships: []
      }
      device_settings: {
        Row: {
          api_key_hash: string
          company_id: string
          created_at: string
          device_id: string
          id: string
          ip_address: string
          is_active: boolean
          last_seen_at: string | null
          name: string
          poll_interval_ms: number
          port: number
          updated_at: string
        }
        Insert: {
          api_key_hash: string
          company_id: string
          created_at?: string
          device_id: string
          id?: string
          ip_address: string
          is_active?: boolean
          last_seen_at?: string | null
          name: string
          poll_interval_ms?: number
          port?: number
          updated_at?: string
        }
        Update: {
          api_key_hash?: string
          company_id?: string
          created_at?: string
          device_id?: string
          id?: string
          ip_address?: string
          is_active?: boolean
          last_seen_at?: string | null
          name?: string
          poll_interval_ms?: number
          port?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      e_invoices: {
        Row: {
          ack_date: string | null
          ack_no: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          created_at: string
          id: string
          invoice_id: string
          irn: string | null
          request_payload: Json | null
          response_payload: Json | null
          signed_invoice: string | null
          signed_qr: string | null
          status: string
          updated_at: string
        }
        Insert: {
          ack_date?: string | null
          ack_no?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          id?: string
          invoice_id: string
          irn?: string | null
          request_payload?: Json | null
          response_payload?: Json | null
          signed_invoice?: string | null
          signed_qr?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          ack_date?: string | null
          ack_no?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          id?: string
          invoice_id?: string
          irn?: string | null
          request_payload?: Json | null
          response_payload?: Json | null
          signed_invoice?: string | null
          signed_qr?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      e_way_bills: {
        Row: {
          created_at: string
          distance_km: number | null
          document_type: string | null
          error_message: string | null
          ewb_date: string | null
          ewb_number: string | null
          generated_by: string | null
          id: string
          invoice_id: string
          request_payload: Json | null
          response_payload: Json | null
          status: string
          sub_supply_type: string | null
          transaction_type: string | null
          transport_mode: string | null
          transporter_id: string | null
          transporter_name: string | null
          updated_at: string
          valid_upto: string | null
          vehicle_number: string | null
        }
        Insert: {
          created_at?: string
          distance_km?: number | null
          document_type?: string | null
          error_message?: string | null
          ewb_date?: string | null
          ewb_number?: string | null
          generated_by?: string | null
          id?: string
          invoice_id: string
          request_payload?: Json | null
          response_payload?: Json | null
          status?: string
          sub_supply_type?: string | null
          transaction_type?: string | null
          transport_mode?: string | null
          transporter_id?: string | null
          transporter_name?: string | null
          updated_at?: string
          valid_upto?: string | null
          vehicle_number?: string | null
        }
        Update: {
          created_at?: string
          distance_km?: number | null
          document_type?: string | null
          error_message?: string | null
          ewb_date?: string | null
          ewb_number?: string | null
          generated_by?: string | null
          id?: string
          invoice_id?: string
          request_payload?: Json | null
          response_payload?: Json | null
          status?: string
          sub_supply_type?: string | null
          transaction_type?: string | null
          transport_mode?: string | null
          transporter_id?: string | null
          transporter_name?: string | null
          updated_at?: string
          valid_upto?: string | null
          vehicle_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "e_way_bills_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_notification_subscriptions: {
        Row: {
          created_at: string
          department: string
          event_key: string
          id: string
          is_active: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          department: string
          event_key: string
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          department?: string
          event_key?: string
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      employees: {
        Row: {
          basic_salary: number
          company_id: string | null
          created_at: string
          da: number
          daily_wage: number
          date_of_joining: string | null
          department: string | null
          designation: string | null
          email: string | null
          employee_code: string
          esi_deduction: number
          full_name: string
          hra: number
          id: string
          is_active: boolean
          ot_rate_per_hour: number
          other_allowances: number
          pay_type: string
          pf_deduction: number
          phone: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          basic_salary?: number
          company_id?: string | null
          created_at?: string
          da?: number
          daily_wage?: number
          date_of_joining?: string | null
          department?: string | null
          designation?: string | null
          email?: string | null
          employee_code: string
          esi_deduction?: number
          full_name: string
          hra?: number
          id?: string
          is_active?: boolean
          ot_rate_per_hour?: number
          other_allowances?: number
          pay_type?: string
          pf_deduction?: number
          phone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          basic_salary?: number
          company_id?: string | null
          created_at?: string
          da?: number
          daily_wage?: number
          date_of_joining?: string | null
          department?: string | null
          designation?: string | null
          email?: string | null
          employee_code?: string
          esi_deduction?: number
          full_name?: string
          hra?: number
          id?: string
          is_active?: boolean
          ot_rate_per_hour?: number
          other_allowances?: number
          pay_type?: string
          pf_deduction?: number
          phone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      exchange_rates: {
        Row: {
          created_at: string
          currency_code: string
          id: string
          rate: number
          rate_date: string
        }
        Insert: {
          created_at?: string
          currency_code: string
          id?: string
          rate: number
          rate_date: string
        }
        Update: {
          created_at?: string
          currency_code?: string
          id?: string
          rate?: number
          rate_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "exchange_rates_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      financial_years: {
        Row: {
          company_id: string | null
          created_at: string
          end_date: string
          id: string
          is_current: boolean
          is_locked: boolean
          name: string
          start_date: string
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          end_date: string
          id?: string
          is_current?: boolean
          is_locked?: boolean
          name: string
          start_date: string
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          end_date?: string
          id?: string
          is_current?: boolean
          is_locked?: boolean
          name?: string
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_years_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      godowns: {
        Row: {
          address: string | null
          code: string | null
          company_id: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          parent_id: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          code?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          parent_id?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          code?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          parent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "godowns_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "godowns_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "godowns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "godowns_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "stock_godown_summary"
            referencedColumns: ["godown_id"]
          },
        ]
      }
      gst_rate_changes: {
        Row: {
          created_at: string
          effective_from: string
          hsn_code: string
          id: string
          new_rate: number
          notes: string | null
          old_rate: number
        }
        Insert: {
          created_at?: string
          effective_from: string
          hsn_code: string
          id?: string
          new_rate: number
          notes?: string | null
          old_rate: number
        }
        Update: {
          created_at?: string
          effective_from?: string
          hsn_code?: string
          id?: string
          new_rate?: number
          notes?: string | null
          old_rate?: number
        }
        Relationships: []
      }
      gst_returns: {
        Row: {
          created_at: string
          filed_at: string | null
          filed_by: string | null
          gstin: string
          id: string
          payload: Json | null
          period_month: number | null
          period_year: number
          return_type: string
          status: string
          summary: Json | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          filed_at?: string | null
          filed_by?: string | null
          gstin: string
          id?: string
          payload?: Json | null
          period_month?: number | null
          period_year: number
          return_type: string
          status?: string
          summary?: Json | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          filed_at?: string | null
          filed_by?: string | null
          gstin?: string
          id?: string
          payload?: Json | null
          period_month?: number | null
          period_year?: number
          return_type?: string
          status?: string
          summary?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      hsn_codes: {
        Row: {
          code: string
          created_at: string
          default_tax_rate: number
          description: string
          id: string
          is_active: boolean
          type: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          default_tax_rate?: number
          description: string
          id?: string
          is_active?: boolean
          type?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          default_tax_rate?: number
          description?: string
          id?: string
          is_active?: boolean
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      in_app_notifications: {
        Row: {
          body: string
          created_at: string
          event_key: string | null
          id: string
          link: string | null
          payload: Json | null
          read_at: string | null
          ref_id: string | null
          ref_table: string | null
          title: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          event_key?: string | null
          id?: string
          link?: string | null
          payload?: Json | null
          read_at?: string | null
          ref_id?: string | null
          ref_table?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          event_key?: string | null
          id?: string
          link?: string | null
          payload?: Json | null
          read_at?: string | null
          ref_id?: string | null
          ref_table?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      intercompany_transactions: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          idempotency_key: string
          reference: string | null
          source_company_id: string
          source_voucher_id: string | null
          status: string
          target_company_id: string
          target_voucher_id: string | null
          transaction_date: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          idempotency_key: string
          reference?: string | null
          source_company_id: string
          source_voucher_id?: string | null
          status?: string
          target_company_id: string
          target_voucher_id?: string | null
          transaction_date: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          idempotency_key?: string
          reference?: string | null
          source_company_id?: string
          source_voucher_id?: string | null
          status?: string
          target_company_id?: string
          target_voucher_id?: string | null
          transaction_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "intercompany_transactions_source_company_id_fkey"
            columns: ["source_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intercompany_transactions_source_voucher_id_fkey"
            columns: ["source_voucher_id"]
            isOneToOne: false
            referencedRelation: "vouchers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intercompany_transactions_target_company_id_fkey"
            columns: ["target_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intercompany_transactions_target_voucher_id_fkey"
            columns: ["target_voucher_id"]
            isOneToOne: false
            referencedRelation: "vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          amount: number | null
          company_id: string | null
          description: string
          hsn_code: string | null
          id: string
          invoice_id: string
          quantity: number
          tax_rate: number
          unit_price: number
        }
        Insert: {
          amount?: number | null
          company_id?: string | null
          description: string
          hsn_code?: string | null
          id?: string
          invoice_id: string
          quantity?: number
          tax_rate?: number
          unit_price?: number
        }
        Update: {
          amount?: number | null
          company_id?: string | null
          description?: string
          hsn_code?: string | null
          id?: string
          invoice_id?: string
          quantity?: number
          tax_rate?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_tax_snapshots: {
        Row: {
          cess: number
          cgst: number
          company_id: string | null
          created_at: string
          igst: number
          invoice_id: string
          sgst: number
          taxable_value: number
        }
        Insert: {
          cess?: number
          cgst?: number
          company_id?: string | null
          created_at?: string
          igst?: number
          invoice_id: string
          sgst?: number
          taxable_value: number
        }
        Update: {
          cess?: number
          cgst?: number
          company_id?: string | null
          created_at?: string
          igst?: number
          invoice_id?: string
          sgst?: number
          taxable_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_tax_snapshots_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          cgst_amount: number | null
          company_id: string | null
          created_at: string
          created_by: string | null
          dispatch_pincode: string | null
          dispatch_state_code: string | null
          due_date: string | null
          export_type: string | null
          id: string
          igst_amount: number | null
          invoice_date: string
          invoice_number: string
          invoice_type: string
          notes: string | null
          paid_amount: number
          party_id: string
          place_of_supply: string | null
          reverse_charge: boolean
          sales_order_id: string | null
          sgst_amount: number | null
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal: number
          supplier_gstin: string | null
          tax_amount: number
          total_amount: number
          updated_at: string
        }
        Insert: {
          cgst_amount?: number | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          dispatch_pincode?: string | null
          dispatch_state_code?: string | null
          due_date?: string | null
          export_type?: string | null
          id?: string
          igst_amount?: number | null
          invoice_date?: string
          invoice_number: string
          invoice_type?: string
          notes?: string | null
          paid_amount?: number
          party_id: string
          place_of_supply?: string | null
          reverse_charge?: boolean
          sales_order_id?: string | null
          sgst_amount?: number | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          supplier_gstin?: string | null
          tax_amount?: number
          total_amount?: number
          updated_at?: string
        }
        Update: {
          cgst_amount?: number | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          dispatch_pincode?: string | null
          dispatch_state_code?: string | null
          due_date?: string | null
          export_type?: string | null
          id?: string
          igst_amount?: number | null
          invoice_date?: string
          invoice_number?: string
          invoice_type?: string
          notes?: string | null
          paid_amount?: number
          party_id?: string
          place_of_supply?: string | null
          reverse_charge?: boolean
          sales_order_id?: string | null
          sgst_amount?: number | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          supplier_gstin?: string | null
          tax_amount?: number
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "party_outstanding"
            referencedColumns: ["party_id"]
          },
          {
            foreignKeyName: "invoices_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_accounts: {
        Row: {
          company_id: string | null
          created_at: string
          group_id: string
          gstin: string | null
          id: string
          is_active: boolean
          is_system: boolean
          mapped_bank_account_id: string | null
          mapped_party_id: string | null
          mapped_supplier_id: string | null
          name: string
          notes: string | null
          opening_balance: number
          opening_balance_type: string
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          group_id: string
          gstin?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          mapped_bank_account_id?: string | null
          mapped_party_id?: string | null
          mapped_supplier_id?: string | null
          name: string
          notes?: string | null
          opening_balance?: number
          opening_balance_type?: string
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          group_id?: string
          gstin?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          mapped_bank_account_id?: string | null
          mapped_party_id?: string | null
          mapped_supplier_id?: string | null
          name?: string
          notes?: string | null
          opening_balance?: number
          opening_balance_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_accounts_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "ledger_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_groups: {
        Row: {
          affects_gross_profit: boolean
          company_id: string | null
          created_at: string
          id: string
          is_system: boolean
          name: string
          nature: Database["public"]["Enums"]["ledger_nature"]
          parent_id: string | null
          updated_at: string
        }
        Insert: {
          affects_gross_profit?: boolean
          company_id?: string | null
          created_at?: string
          id?: string
          is_system?: boolean
          name: string
          nature: Database["public"]["Enums"]["ledger_nature"]
          parent_id?: string | null
          updated_at?: string
        }
        Update: {
          affects_gross_profit?: boolean
          company_id?: string | null
          created_at?: string
          id?: string
          is_system?: boolean
          name?: string
          nature?: Database["public"]["Enums"]["ledger_nature"]
          parent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_groups_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_groups_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "ledger_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      model_boq: {
        Row: {
          company_id: string | null
          id: string
          model_id: string
          quantity_per_unit: number
          raw_material_id: string
        }
        Insert: {
          company_id?: string | null
          id?: string
          model_id: string
          quantity_per_unit?: number
          raw_material_id: string
        }
        Update: {
          company_id?: string | null
          id?: string
          model_id?: string
          quantity_per_unit?: number
          raw_material_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "model_boq_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "model_boq_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "product_models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "model_boq_raw_material_id_fkey"
            columns: ["raw_material_id"]
            isOneToOne: false
            referencedRelation: "raw_materials"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_event_channels: {
        Row: {
          body_template: string | null
          channel: string
          created_at: string
          event_key: string
          is_enabled: boolean
          subject_template: string | null
          template_name: string | null
          updated_at: string
        }
        Insert: {
          body_template?: string | null
          channel: string
          created_at?: string
          event_key: string
          is_enabled?: boolean
          subject_template?: string | null
          template_name?: string | null
          updated_at?: string
        }
        Update: {
          body_template?: string | null
          channel?: string
          created_at?: string
          event_key?: string
          is_enabled?: boolean
          subject_template?: string | null
          template_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_event_channels_event_key_fkey"
            columns: ["event_key"]
            isOneToOne: false
            referencedRelation: "notification_events"
            referencedColumns: ["event_key"]
          },
        ]
      }
      notification_events: {
        Row: {
          category: string
          created_at: string
          description: string | null
          event_key: string
          is_active: boolean
          label: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          event_key: string
          is_active?: boolean
          label: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          event_key?: string
          is_active?: boolean
          label?: string
          updated_at?: string
        }
        Relationships: []
      }
      notification_log: {
        Row: {
          channel: string
          error: string | null
          event_type: string
          failure_reason: string | null
          id: string
          idempotency_key: string | null
          party_id: string | null
          party_kind: string
          payload: Json | null
          read_at: string | null
          read_status: string
          recipient_phone: string | null
          ref_id: string | null
          ref_table: string | null
          sent_at: string
          status: string
          template_name: string | null
          whatsapp_message_id: string | null
        }
        Insert: {
          channel?: string
          error?: string | null
          event_type: string
          failure_reason?: string | null
          id?: string
          idempotency_key?: string | null
          party_id?: string | null
          party_kind: string
          payload?: Json | null
          read_at?: string | null
          read_status?: string
          recipient_phone?: string | null
          ref_id?: string | null
          ref_table?: string | null
          sent_at?: string
          status?: string
          template_name?: string | null
          whatsapp_message_id?: string | null
        }
        Update: {
          channel?: string
          error?: string | null
          event_type?: string
          failure_reason?: string | null
          id?: string
          idempotency_key?: string | null
          party_id?: string | null
          party_kind?: string
          payload?: Json | null
          read_at?: string | null
          read_status?: string
          recipient_phone?: string | null
          ref_id?: string | null
          ref_table?: string | null
          sent_at?: string
          status?: string
          template_name?: string | null
          whatsapp_message_id?: string | null
        }
        Relationships: []
      }
      notification_providers: {
        Row: {
          channel: string
          config: Json
          created_at: string
          display_name: string
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          notes: string | null
          priority: number
          secret_env_keys: Json
          updated_at: string
        }
        Insert: {
          channel: string
          config?: Json
          created_at?: string
          display_name: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          notes?: string | null
          priority?: number
          secret_env_keys?: Json
          updated_at?: string
        }
        Update: {
          channel?: string
          config?: Json
          created_at?: string
          display_name?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          notes?: string | null
          priority?: number
          secret_env_keys?: Json
          updated_at?: string
        }
        Relationships: []
      }
      parties: {
        Row: {
          address: string | null
          company_id: string | null
          contact_person: string | null
          created_at: string
          credit_limit: number
          current_balance: number
          customer_code: string | null
          email: string | null
          gstin: string | null
          id: string
          name: string
          notes: string | null
          opening_balance: number
          owner_id: string | null
          phone: string | null
          pin_code: string | null
          promo_opt_in: boolean
          state_code: string | null
          tally_name: string | null
          updated_at: string
          user_id: string | null
          whatsapp_number: string | null
          whatsapp_opt_in: boolean
        }
        Insert: {
          address?: string | null
          company_id?: string | null
          contact_person?: string | null
          created_at?: string
          credit_limit?: number
          current_balance?: number
          customer_code?: string | null
          email?: string | null
          gstin?: string | null
          id?: string
          name: string
          notes?: string | null
          opening_balance?: number
          owner_id?: string | null
          phone?: string | null
          pin_code?: string | null
          promo_opt_in?: boolean
          state_code?: string | null
          tally_name?: string | null
          updated_at?: string
          user_id?: string | null
          whatsapp_number?: string | null
          whatsapp_opt_in?: boolean
        }
        Update: {
          address?: string | null
          company_id?: string | null
          contact_person?: string | null
          created_at?: string
          credit_limit?: number
          current_balance?: number
          customer_code?: string | null
          email?: string | null
          gstin?: string | null
          id?: string
          name?: string
          notes?: string | null
          opening_balance?: number
          owner_id?: string | null
          phone?: string | null
          pin_code?: string | null
          promo_opt_in?: boolean
          state_code?: string | null
          tally_name?: string | null
          updated_at?: string
          user_id?: string | null
          whatsapp_number?: string | null
          whatsapp_opt_in?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "parties_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      party_ledger_entries: {
        Row: {
          created_at: string
          credit: number
          debit: number
          entry_date: string
          external_ref: string | null
          id: string
          narration: string | null
          party_id: string
          source: string
          voucher_number: string | null
          voucher_type: string | null
        }
        Insert: {
          created_at?: string
          credit?: number
          debit?: number
          entry_date: string
          external_ref?: string | null
          id?: string
          narration?: string | null
          party_id: string
          source?: string
          voucher_number?: string | null
          voucher_type?: string | null
        }
        Update: {
          created_at?: string
          credit?: number
          debit?: number
          entry_date?: string
          external_ref?: string | null
          id?: string
          narration?: string | null
          party_id?: string
          source?: string
          voucher_number?: string | null
          voucher_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "party_ledger_entries_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_ledger_entries_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "party_outstanding"
            referencedColumns: ["party_id"]
          },
        ]
      }
      payslips: {
        Row: {
          days_absent: number
          days_worked: number
          deductions: number
          employee_id: string
          generated_at: string
          gross_salary: number
          id: string
          net_salary: number
          ot_hours: number
          period_month: number
          period_year: number
        }
        Insert: {
          days_absent?: number
          days_worked?: number
          deductions?: number
          employee_id: string
          generated_at?: string
          gross_salary?: number
          id?: string
          net_salary?: number
          ot_hours?: number
          period_month: number
          period_year: number
        }
        Update: {
          days_absent?: number
          days_worked?: number
          deductions?: number
          employee_id?: string
          generated_at?: string
          gross_salary?: number
          id?: string
          net_salary?: number
          ot_hours?: number
          period_month?: number
          period_year?: number
        }
        Relationships: [
          {
            foreignKeyName: "payslips_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      product_models: {
        Row: {
          code: string | null
          company_id: string | null
          cover_fabric: string | null
          created_at: string
          created_by: string | null
          default_price: number
          extra_specs: Json
          foam_density: string | null
          id: string
          name: string
          notes: string | null
          size: string | null
          thickness: string | null
          updated_at: string
          warranty: string | null
        }
        Insert: {
          code?: string | null
          company_id?: string | null
          cover_fabric?: string | null
          created_at?: string
          created_by?: string | null
          default_price?: number
          extra_specs?: Json
          foam_density?: string | null
          id?: string
          name: string
          notes?: string | null
          size?: string | null
          thickness?: string | null
          updated_at?: string
          warranty?: string | null
        }
        Update: {
          code?: string | null
          company_id?: string | null
          cover_fabric?: string | null
          created_at?: string
          created_by?: string | null
          default_price?: number
          extra_specs?: Json
          foam_density?: string | null
          id?: string
          name?: string
          notes?: string | null
          size?: string | null
          thickness?: string | null
          updated_at?: string
          warranty?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_models_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      production_orders: {
        Row: {
          assigned_to: string | null
          company_id: string | null
          created_at: string
          dispatched_at: string | null
          id: string
          notes: string | null
          production_number: string
          qc_at: string | null
          ready_at: string | null
          sales_order_id: string
          started_at: string | null
          status: Database["public"]["Enums"]["production_status"]
          tracking_number: string | null
          transporter_name: string | null
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          company_id?: string | null
          created_at?: string
          dispatched_at?: string | null
          id?: string
          notes?: string | null
          production_number: string
          qc_at?: string | null
          ready_at?: string | null
          sales_order_id: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["production_status"]
          tracking_number?: string | null
          transporter_name?: string | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          company_id?: string | null
          created_at?: string
          dispatched_at?: string | null
          id?: string
          notes?: string | null
          production_number?: string
          qc_at?: string | null
          ready_at?: string | null
          sales_order_id?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["production_status"]
          tracking_number?: string | null
          transporter_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active_company_id: string | null
          approved_at: string | null
          approved_by: string | null
          created_at: string
          department: string | null
          email: string
          full_name: string
          id: string
          phone: string | null
          status: Database["public"]["Enums"]["user_status"]
          updated_at: string
          whatsapp_number: string | null
          whatsapp_opt_in: boolean
        }
        Insert: {
          active_company_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          department?: string | null
          email: string
          full_name: string
          id: string
          phone?: string | null
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
          whatsapp_number?: string | null
          whatsapp_opt_in?: boolean
        }
        Update: {
          active_company_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          department?: string | null
          email?: string
          full_name?: string
          id?: string
          phone?: string | null
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
          whatsapp_number?: string | null
          whatsapp_opt_in?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "profiles_active_company_id_fkey"
            columns: ["active_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      punch_events: {
        Row: {
          created_at: string
          device_id: string | null
          employee_code: string
          employee_id: string | null
          id: string
          punch_time: string
          punch_type: Database["public"]["Enums"]["punch_type"]
          raw_payload: Json | null
        }
        Insert: {
          created_at?: string
          device_id?: string | null
          employee_code: string
          employee_id?: string | null
          id?: string
          punch_time: string
          punch_type: Database["public"]["Enums"]["punch_type"]
          raw_payload?: Json | null
        }
        Update: {
          created_at?: string
          device_id?: string | null
          employee_code?: string
          employee_id?: string | null
          id?: string
          punch_time?: string
          punch_type?: Database["public"]["Enums"]["punch_type"]
          raw_payload?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "punch_events_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_bill_items: {
        Row: {
          amount: number | null
          company_id: string | null
          id: string
          purchase_bill_id: string
          quantity: number
          raw_material_id: string
          unit_price: number
        }
        Insert: {
          amount?: number | null
          company_id?: string | null
          id?: string
          purchase_bill_id: string
          quantity?: number
          raw_material_id: string
          unit_price?: number
        }
        Update: {
          amount?: number | null
          company_id?: string | null
          id?: string
          purchase_bill_id?: string
          quantity?: number
          raw_material_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_bill_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_bill_items_purchase_bill_id_fkey"
            columns: ["purchase_bill_id"]
            isOneToOne: false
            referencedRelation: "purchase_bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_bill_items_raw_material_id_fkey"
            columns: ["raw_material_id"]
            isOneToOne: false
            referencedRelation: "raw_materials"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_bills: {
        Row: {
          bill_date: string
          bill_number: string
          cgst_amount: number
          company_id: string | null
          created_at: string
          created_by: string | null
          eligibility_for_itc: string
          expected_dispatch_date: string | null
          id: string
          igst_amount: number
          invoice_type: string
          notes: string | null
          place_of_supply: string | null
          receipt_status: string
          reverse_charge: boolean
          sgst_amount: number
          subtotal: number
          supplier_gstin: string | null
          supplier_id: string | null
          tax_amount: number
          total_amount: number
          updated_at: string
          vendor_ack_at: string | null
          vendor_ack_note: string | null
          vendor_ack_status: string
        }
        Insert: {
          bill_date?: string
          bill_number: string
          cgst_amount?: number
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          eligibility_for_itc?: string
          expected_dispatch_date?: string | null
          id?: string
          igst_amount?: number
          invoice_type?: string
          notes?: string | null
          place_of_supply?: string | null
          receipt_status?: string
          reverse_charge?: boolean
          sgst_amount?: number
          subtotal?: number
          supplier_gstin?: string | null
          supplier_id?: string | null
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          vendor_ack_at?: string | null
          vendor_ack_note?: string | null
          vendor_ack_status?: string
        }
        Update: {
          bill_date?: string
          bill_number?: string
          cgst_amount?: number
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          eligibility_for_itc?: string
          expected_dispatch_date?: string | null
          id?: string
          igst_amount?: number
          invoice_type?: string
          notes?: string | null
          place_of_supply?: string | null
          receipt_status?: string
          reverse_charge?: boolean
          sgst_amount?: number
          subtotal?: number
          supplier_gstin?: string | null
          supplier_id?: string | null
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          vendor_ack_at?: string | null
          vendor_ack_note?: string | null
          vendor_ack_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_bills_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_bills_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      raw_materials: {
        Row: {
          code: string | null
          company_id: string | null
          created_at: string
          current_stock: number
          id: string
          name: string
          notes: string | null
          reorder_level: number
          unit: string
          updated_at: string
        }
        Insert: {
          code?: string | null
          company_id?: string | null
          created_at?: string
          current_stock?: number
          id?: string
          name: string
          notes?: string | null
          reorder_level?: number
          unit?: string
          updated_at?: string
        }
        Update: {
          code?: string | null
          company_id?: string | null
          created_at?: string
          current_stock?: number
          id?: string
          name?: string
          notes?: string | null
          reorder_level?: number
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "raw_materials_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_order_items: {
        Row: {
          amount: number | null
          company_id: string | null
          id: string
          model_id: string | null
          product_name: string
          quantity: number
          sales_order_id: string
          size: string | null
          unit_price: number
        }
        Insert: {
          amount?: number | null
          company_id?: string | null
          id?: string
          model_id?: string | null
          product_name: string
          quantity?: number
          sales_order_id: string
          size?: string | null
          unit_price?: number
        }
        Update: {
          amount?: number | null
          company_id?: string | null
          id?: string
          model_id?: string | null
          product_name?: string
          quantity?: number
          sales_order_id?: string
          size?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_order_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_items_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "product_models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_items_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_orders: {
        Row: {
          company_id: string | null
          created_at: string
          created_by: string | null
          expected_delivery: string | null
          fulfillment_status: string
          id: string
          notes: string | null
          order_date: string
          order_number: string
          party_id: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          expected_delivery?: string | null
          fulfillment_status?: string
          id?: string
          notes?: string | null
          order_date?: string
          order_number: string
          party_id: string
          total_amount?: number
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          expected_delivery?: string | null
          fulfillment_status?: string
          id?: string
          notes?: string | null
          order_date?: string
          order_number?: string
          party_id?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "party_outstanding"
            referencedColumns: ["party_id"]
          },
        ]
      }
      shift_settings: {
        Row: {
          half_day_deduction_pct: number
          half_day_hours: number
          id: string
          late_deduction_pct: number
          late_grace_minutes: number
          shift_end: string
          shift_start: string
          updated_at: string
          working_days_per_month: number
        }
        Insert: {
          half_day_deduction_pct?: number
          half_day_hours?: number
          id?: string
          late_deduction_pct?: number
          late_grace_minutes?: number
          shift_end?: string
          shift_start?: string
          updated_at?: string
          working_days_per_month?: number
        }
        Update: {
          half_day_deduction_pct?: number
          half_day_hours?: number
          id?: string
          late_deduction_pct?: number
          late_grace_minutes?: number
          shift_end?: string
          shift_start?: string
          updated_at?: string
          working_days_per_month?: number
        }
        Relationships: []
      }
      stock_batches: {
        Row: {
          batch_number: string
          created_at: string
          expiry_date: string | null
          godown_id: string | null
          id: string
          mfg_date: string | null
          notes: string | null
          opening_qty: number
          opening_rate: number
          stock_item_id: string
          updated_at: string
        }
        Insert: {
          batch_number: string
          created_at?: string
          expiry_date?: string | null
          godown_id?: string | null
          id?: string
          mfg_date?: string | null
          notes?: string | null
          opening_qty?: number
          opening_rate?: number
          stock_item_id: string
          updated_at?: string
        }
        Update: {
          batch_number?: string
          created_at?: string
          expiry_date?: string | null
          godown_id?: string | null
          id?: string
          mfg_date?: string | null
          notes?: string | null
          opening_qty?: number
          opening_rate?: number
          stock_item_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_batches_godown_id_fkey"
            columns: ["godown_id"]
            isOneToOne: false
            referencedRelation: "godowns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_batches_godown_id_fkey"
            columns: ["godown_id"]
            isOneToOne: false
            referencedRelation: "stock_godown_summary"
            referencedColumns: ["godown_id"]
          },
          {
            foreignKeyName: "stock_batches_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_godown_summary"
            referencedColumns: ["stock_item_id"]
          },
          {
            foreignKeyName: "stock_batches_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_batches_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_summary"
            referencedColumns: ["stock_item_id"]
          },
        ]
      }
      stock_items: {
        Row: {
          alternate_unit: string | null
          code: string | null
          company_id: string | null
          conversion_factor: number
          created_at: string
          gst_rate: number
          hsn_code: string | null
          id: string
          is_active: boolean
          mapped_model_id: string | null
          mapped_raw_material_id: string | null
          max_stock: number | null
          min_stock: number
          name: string
          notes: string | null
          reorder_level: number
          reorder_quantity: number
          standard_cost: number
          standard_price: number
          track_batches: boolean
          unit: string
          updated_at: string
          valuation_method: Database["public"]["Enums"]["valuation_method"]
        }
        Insert: {
          alternate_unit?: string | null
          code?: string | null
          company_id?: string | null
          conversion_factor?: number
          created_at?: string
          gst_rate?: number
          hsn_code?: string | null
          id?: string
          is_active?: boolean
          mapped_model_id?: string | null
          mapped_raw_material_id?: string | null
          max_stock?: number | null
          min_stock?: number
          name: string
          notes?: string | null
          reorder_level?: number
          reorder_quantity?: number
          standard_cost?: number
          standard_price?: number
          track_batches?: boolean
          unit?: string
          updated_at?: string
          valuation_method?: Database["public"]["Enums"]["valuation_method"]
        }
        Update: {
          alternate_unit?: string | null
          code?: string | null
          company_id?: string | null
          conversion_factor?: number
          created_at?: string
          gst_rate?: number
          hsn_code?: string | null
          id?: string
          is_active?: boolean
          mapped_model_id?: string | null
          mapped_raw_material_id?: string | null
          max_stock?: number | null
          min_stock?: number
          name?: string
          notes?: string | null
          reorder_level?: number
          reorder_quantity?: number
          standard_cost?: number
          standard_price?: number
          track_batches?: boolean
          unit?: string
          updated_at?: string
          valuation_method?: Database["public"]["Enums"]["valuation_method"]
        }
        Relationships: [
          {
            foreignKeyName: "stock_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_items_mapped_model_id_fkey"
            columns: ["mapped_model_id"]
            isOneToOne: false
            referencedRelation: "product_models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_items_mapped_raw_material_id_fkey"
            columns: ["mapped_raw_material_id"]
            isOneToOne: false
            referencedRelation: "raw_materials"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_journal_entries: {
        Row: {
          amount: number
          batch_id: string | null
          direction: string
          from_godown_id: string | null
          id: string
          journal_id: string
          line_order: number
          quantity: number
          rate: number
          stock_item_id: string
          to_godown_id: string | null
        }
        Insert: {
          amount?: number
          batch_id?: string | null
          direction: string
          from_godown_id?: string | null
          id?: string
          journal_id: string
          line_order?: number
          quantity: number
          rate?: number
          stock_item_id: string
          to_godown_id?: string | null
        }
        Update: {
          amount?: number
          batch_id?: string | null
          direction?: string
          from_godown_id?: string | null
          id?: string
          journal_id?: string
          line_order?: number
          quantity?: number
          rate?: number
          stock_item_id?: string
          to_godown_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_journal_entries_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "stock_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_journal_entries_from_godown_id_fkey"
            columns: ["from_godown_id"]
            isOneToOne: false
            referencedRelation: "godowns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_journal_entries_from_godown_id_fkey"
            columns: ["from_godown_id"]
            isOneToOne: false
            referencedRelation: "stock_godown_summary"
            referencedColumns: ["godown_id"]
          },
          {
            foreignKeyName: "stock_journal_entries_journal_id_fkey"
            columns: ["journal_id"]
            isOneToOne: false
            referencedRelation: "stock_journals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_journal_entries_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_godown_summary"
            referencedColumns: ["stock_item_id"]
          },
          {
            foreignKeyName: "stock_journal_entries_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_journal_entries_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_summary"
            referencedColumns: ["stock_item_id"]
          },
          {
            foreignKeyName: "stock_journal_entries_to_godown_id_fkey"
            columns: ["to_godown_id"]
            isOneToOne: false
            referencedRelation: "godowns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_journal_entries_to_godown_id_fkey"
            columns: ["to_godown_id"]
            isOneToOne: false
            referencedRelation: "stock_godown_summary"
            referencedColumns: ["godown_id"]
          },
        ]
      }
      stock_journals: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          journal_date: string
          journal_number: string
          journal_type: string
          narration: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          journal_date?: string
          journal_number: string
          journal_type?: string
          narration?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          journal_date?: string
          journal_number?: string
          journal_type?: string
          narration?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      stock_movements: {
        Row: {
          amount: number
          batch_id: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          godown_id: string | null
          id: string
          idempotency_key: string | null
          movement_date: string
          movement_type: Database["public"]["Enums"]["stock_movement_type"]
          narration: string | null
          posting_id: string | null
          quantity: number
          rate: number
          reverses_posting_id: string | null
          source_id: string | null
          source_table: string | null
          stock_item_id: string
          voucher_id: string | null
        }
        Insert: {
          amount?: number
          batch_id?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          godown_id?: string | null
          id?: string
          idempotency_key?: string | null
          movement_date?: string
          movement_type: Database["public"]["Enums"]["stock_movement_type"]
          narration?: string | null
          posting_id?: string | null
          quantity: number
          rate?: number
          reverses_posting_id?: string | null
          source_id?: string | null
          source_table?: string | null
          stock_item_id: string
          voucher_id?: string | null
        }
        Update: {
          amount?: number
          batch_id?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          godown_id?: string | null
          id?: string
          idempotency_key?: string | null
          movement_date?: string
          movement_type?: Database["public"]["Enums"]["stock_movement_type"]
          narration?: string | null
          posting_id?: string | null
          quantity?: number
          rate?: number
          reverses_posting_id?: string | null
          source_id?: string | null
          source_table?: string | null
          stock_item_id?: string
          voucher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "stock_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_godown_id_fkey"
            columns: ["godown_id"]
            isOneToOne: false
            referencedRelation: "godowns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_godown_id_fkey"
            columns: ["godown_id"]
            isOneToOne: false
            referencedRelation: "stock_godown_summary"
            referencedColumns: ["godown_id"]
          },
          {
            foreignKeyName: "stock_movements_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_godown_summary"
            referencedColumns: ["stock_item_id"]
          },
          {
            foreignKeyName: "stock_movements_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_summary"
            referencedColumns: ["stock_item_id"]
          },
          {
            foreignKeyName: "stock_movements_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_postings: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          idempotency_key: string | null
          posting_type: string
          source_id: string | null
          source_table: string | null
          status: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string | null
          posting_type: string
          source_id?: string | null
          source_table?: string | null
          status?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string | null
          posting_type?: string
          source_id?: string | null
          source_table?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_postings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_reservations: {
        Row: {
          company_id: string | null
          created_at: string
          godown_id: string | null
          id: string
          idempotency_key: string | null
          qty: number
          source_id: string
          source_table: string
          status: string
          stock_item_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          godown_id?: string | null
          id?: string
          idempotency_key?: string | null
          qty: number
          source_id: string
          source_table: string
          status?: string
          stock_item_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          godown_id?: string | null
          id?: string
          idempotency_key?: string | null
          qty?: number
          source_id?: string
          source_table?: string
          status?: string
          stock_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_reservations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_reservations_godown_id_fkey"
            columns: ["godown_id"]
            isOneToOne: false
            referencedRelation: "godowns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_reservations_godown_id_fkey"
            columns: ["godown_id"]
            isOneToOne: false
            referencedRelation: "stock_godown_summary"
            referencedColumns: ["godown_id"]
          },
          {
            foreignKeyName: "stock_reservations_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_godown_summary"
            referencedColumns: ["stock_item_id"]
          },
          {
            foreignKeyName: "stock_reservations_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_reservations_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_summary"
            referencedColumns: ["stock_item_id"]
          },
        ]
      }
      stock_valuation_settings: {
        Row: {
          allow_negative_stock: boolean
          company_id: string | null
          default_godown_id: string | null
          default_method: Database["public"]["Enums"]["valuation_method"]
          id: string
          updated_at: string
        }
        Insert: {
          allow_negative_stock?: boolean
          company_id?: string | null
          default_godown_id?: string | null
          default_method?: Database["public"]["Enums"]["valuation_method"]
          id?: string
          updated_at?: string
        }
        Update: {
          allow_negative_stock?: boolean
          company_id?: string | null
          default_godown_id?: string | null
          default_method?: Database["public"]["Enums"]["valuation_method"]
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_valuation_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_valuation_settings_default_godown_id_fkey"
            columns: ["default_godown_id"]
            isOneToOne: false
            referencedRelation: "godowns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_valuation_settings_default_godown_id_fkey"
            columns: ["default_godown_id"]
            isOneToOne: false
            referencedRelation: "stock_godown_summary"
            referencedColumns: ["godown_id"]
          },
        ]
      }
      supplier_ledger_entries: {
        Row: {
          created_at: string
          credit: number
          debit: number
          entry_date: string
          external_ref: string | null
          id: string
          narration: string | null
          source: string
          supplier_id: string
          voucher_number: string | null
          voucher_type: string | null
        }
        Insert: {
          created_at?: string
          credit?: number
          debit?: number
          entry_date: string
          external_ref?: string | null
          id?: string
          narration?: string | null
          source?: string
          supplier_id: string
          voucher_number?: string | null
          voucher_type?: string | null
        }
        Update: {
          created_at?: string
          credit?: number
          debit?: number
          entry_date?: string
          external_ref?: string | null
          id?: string
          narration?: string | null
          source?: string
          supplier_id?: string
          voucher_number?: string | null
          voucher_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_ledger_entries_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          company_id: string | null
          contact_person: string | null
          created_at: string
          current_balance: number
          email: string | null
          gstin: string | null
          id: string
          name: string
          notes: string | null
          opening_balance: number
          phone: string | null
          pin_code: string | null
          promo_opt_in: boolean
          state_code: string | null
          tally_name: string | null
          updated_at: string
          user_id: string | null
          vendor_code: string | null
          whatsapp_number: string | null
          whatsapp_opt_in: boolean
        }
        Insert: {
          address?: string | null
          company_id?: string | null
          contact_person?: string | null
          created_at?: string
          current_balance?: number
          email?: string | null
          gstin?: string | null
          id?: string
          name: string
          notes?: string | null
          opening_balance?: number
          phone?: string | null
          pin_code?: string | null
          promo_opt_in?: boolean
          state_code?: string | null
          tally_name?: string | null
          updated_at?: string
          user_id?: string | null
          vendor_code?: string | null
          whatsapp_number?: string | null
          whatsapp_opt_in?: boolean
        }
        Update: {
          address?: string | null
          company_id?: string | null
          contact_person?: string | null
          created_at?: string
          current_balance?: number
          email?: string | null
          gstin?: string | null
          id?: string
          name?: string
          notes?: string | null
          opening_balance?: number
          phone?: string | null
          pin_code?: string | null
          promo_opt_in?: boolean
          state_code?: string | null
          tally_name?: string | null
          updated_at?: string
          user_id?: string | null
          vendor_code?: string | null
          whatsapp_number?: string | null
          whatsapp_opt_in?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      tally_migration_issues: {
        Row: {
          code: string
          created_at: string
          details: Json
          id: string
          message: string
          resolved: boolean
          row_id: string | null
          run_id: string
          severity: string
        }
        Insert: {
          code: string
          created_at?: string
          details?: Json
          id?: string
          message: string
          resolved?: boolean
          row_id?: string | null
          run_id: string
          severity: string
        }
        Update: {
          code?: string
          created_at?: string
          details?: Json
          id?: string
          message?: string
          resolved?: boolean
          row_id?: string | null
          run_id?: string
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "tally_migration_issues_row_id_fkey"
            columns: ["row_id"]
            isOneToOne: false
            referencedRelation: "tally_migration_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tally_migration_issues_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "tally_migration_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      tally_migration_rows: {
        Row: {
          alter_id: string | null
          canonical_id: string | null
          canonical_status: string
          company_id: string
          created_at: string
          id: string
          lifecycle_state: string
          parent_source_key: string | null
          payload: Json
          payload_hash: string
          record_type: string
          run_id: string
          source_id: string | null
          source_key: string
        }
        Insert: {
          alter_id?: string | null
          canonical_id?: string | null
          canonical_status?: string
          company_id: string
          created_at?: string
          id?: string
          lifecycle_state?: string
          parent_source_key?: string | null
          payload: Json
          payload_hash: string
          record_type: string
          run_id: string
          source_id?: string | null
          source_key: string
        }
        Update: {
          alter_id?: string | null
          canonical_id?: string | null
          canonical_status?: string
          company_id?: string
          created_at?: string
          id?: string
          lifecycle_state?: string
          parent_source_key?: string | null
          payload?: Json
          payload_hash?: string
          record_type?: string
          run_id?: string
          source_id?: string | null
          source_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "tally_migration_rows_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tally_migration_rows_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "tally_migration_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      tally_migration_runs: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          company_id: string
          completed_at: string | null
          control_totals: Json
          created_by: string | null
          id: string
          notes: string | null
          source_checksum: string | null
          source_company_guid: string | null
          source_company_name: string | null
          started_at: string
          status: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          company_id: string
          completed_at?: string | null
          control_totals?: Json
          created_by?: string | null
          id?: string
          notes?: string | null
          source_checksum?: string | null
          source_company_guid?: string | null
          source_company_name?: string | null
          started_at?: string
          status?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          company_id?: string
          completed_at?: string | null
          control_totals?: Json
          created_by?: string | null
          id?: string
          notes?: string | null
          source_checksum?: string | null
          source_company_guid?: string | null
          source_company_name?: string | null
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "tally_migration_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      tally_reconciliation_snapshots: {
        Row: {
          as_of_date: string
          company_id: string
          control_type: string
          created_at: string
          details: Json
          difference: number | null
          erp_value: number | null
          id: string
          run_id: string | null
          source_reference: string | null
          status: string
          tally_value: number | null
          tolerance: number
        }
        Insert: {
          as_of_date: string
          company_id: string
          control_type: string
          created_at?: string
          details?: Json
          difference?: number | null
          erp_value?: number | null
          id?: string
          run_id?: string | null
          source_reference?: string | null
          status?: string
          tally_value?: number | null
          tolerance?: number
        }
        Update: {
          as_of_date?: string
          company_id?: string
          control_type?: string
          created_at?: string
          details?: Json
          difference?: number | null
          erp_value?: number | null
          id?: string
          run_id?: string | null
          source_reference?: string | null
          status?: string
          tally_value?: number | null
          tolerance?: number
        }
        Relationships: [
          {
            foreignKeyName: "tally_reconciliation_snapshots_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tally_reconciliation_snapshots_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "tally_migration_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      trusted_devices: {
        Row: {
          created_at: string
          device_id: string
          device_name: string | null
          id: string
          last_used_at: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          device_id: string
          device_name?: string | null
          id?: string
          last_used_at?: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          device_id?: string
          device_name?: string | null
          id?: string
          last_used_at?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_company_access: {
        Row: {
          can_create: boolean
          can_delete: boolean
          can_edit: boolean
          can_view: boolean
          company_id: string
          created_at: string
          id: string
          is_default: boolean
          user_id: string
        }
        Insert: {
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_view?: boolean
          company_id: string
          created_at?: string
          id?: string
          is_default?: boolean
          user_id: string
        }
        Update: {
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_view?: boolean
          company_id?: string
          created_at?: string
          id?: string
          is_default?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_company_access_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      velocity_auth_token: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          token: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          token: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          token?: string
          updated_at?: string
        }
        Relationships: []
      }
      velocity_warehouses: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          city: string | null
          contact_person: string | null
          country: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          last_synced_at: string
          name: string
          phone: string | null
          pincode: string | null
          raw: Json
          state: string | null
          updated_at: string
          velocity_id: string
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          contact_person?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          last_synced_at?: string
          name: string
          phone?: string | null
          pincode?: string | null
          raw?: Json
          state?: string | null
          updated_at?: string
          velocity_id: string
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          contact_person?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          last_synced_at?: string
          name?: string
          phone?: string | null
          pincode?: string | null
          raw?: Json
          state?: string | null
          updated_at?: string
          velocity_id?: string
        }
        Relationships: []
      }
      vendor_invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          supplier_id: string
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          supplier_id: string
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          supplier_id?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_invites_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      voucher_audit_log: {
        Row: {
          action: string
          changed_at: string
          changed_by: string | null
          entry_id: string | null
          id: string
          new_data: Json | null
          note: string | null
          old_data: Json | null
          table_name: string
          voucher_id: string | null
        }
        Insert: {
          action: string
          changed_at?: string
          changed_by?: string | null
          entry_id?: string | null
          id?: string
          new_data?: Json | null
          note?: string | null
          old_data?: Json | null
          table_name: string
          voucher_id?: string | null
        }
        Update: {
          action?: string
          changed_at?: string
          changed_by?: string | null
          entry_id?: string | null
          id?: string
          new_data?: Json | null
          note?: string | null
          old_data?: Json | null
          table_name?: string
          voucher_id?: string | null
        }
        Relationships: []
      }
      voucher_entries: {
        Row: {
          company_id: string | null
          cost_center_id: string | null
          created_at: string
          credit: number
          debit: number
          id: string
          ledger_account_id: string
          line_order: number
          narration: string | null
          voucher_id: string
        }
        Insert: {
          company_id?: string | null
          cost_center_id?: string | null
          created_at?: string
          credit?: number
          debit?: number
          id?: string
          ledger_account_id: string
          line_order?: number
          narration?: string | null
          voucher_id: string
        }
        Update: {
          company_id?: string | null
          cost_center_id?: string | null
          created_at?: string
          credit?: number
          debit?: number
          id?: string
          ledger_account_id?: string
          line_order?: number
          narration?: string | null
          voucher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voucher_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voucher_entries_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voucher_entries_ledger_account_id_fkey"
            columns: ["ledger_account_id"]
            isOneToOne: false
            referencedRelation: "ledger_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voucher_entries_ledger_account_id_fkey"
            columns: ["ledger_account_id"]
            isOneToOne: false
            referencedRelation: "ledger_balances"
            referencedColumns: ["ledger_id"]
          },
          {
            foreignKeyName: "voucher_entries_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
      voucher_number_series: {
        Row: {
          company_id: string | null
          id: string
          next_number: number
          prefix: string
          suffix: string
          updated_at: string
          voucher_type: Database["public"]["Enums"]["voucher_type"]
          width: number
        }
        Insert: {
          company_id?: string | null
          id?: string
          next_number?: number
          prefix?: string
          suffix?: string
          updated_at?: string
          voucher_type: Database["public"]["Enums"]["voucher_type"]
          width?: number
        }
        Update: {
          company_id?: string | null
          id?: string
          next_number?: number
          prefix?: string
          suffix?: string
          updated_at?: string
          voucher_type?: Database["public"]["Enums"]["voucher_type"]
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "voucher_number_series_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      vouchers: {
        Row: {
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          currency_code: string | null
          exchange_rate: number
          financial_year_id: string | null
          id: string
          idempotency_key: string | null
          is_locked: boolean
          narration: string | null
          posted_at: string
          posted_by: string | null
          reference: string | null
          reversal_of: string | null
          reversal_reason: string | null
          reversed_by: string | null
          row_version: number
          source_id: string | null
          source_table: string | null
          status: string
          updated_at: string
          voucher_date: string
          voucher_number: string
          voucher_type: Database["public"]["Enums"]["voucher_type"]
        }
        Insert: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          currency_code?: string | null
          exchange_rate?: number
          financial_year_id?: string | null
          id?: string
          idempotency_key?: string | null
          is_locked?: boolean
          narration?: string | null
          posted_at?: string
          posted_by?: string | null
          reference?: string | null
          reversal_of?: string | null
          reversal_reason?: string | null
          reversed_by?: string | null
          row_version?: number
          source_id?: string | null
          source_table?: string | null
          status?: string
          updated_at?: string
          voucher_date?: string
          voucher_number: string
          voucher_type: Database["public"]["Enums"]["voucher_type"]
        }
        Update: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          currency_code?: string | null
          exchange_rate?: number
          financial_year_id?: string | null
          id?: string
          idempotency_key?: string | null
          is_locked?: boolean
          narration?: string | null
          posted_at?: string
          posted_by?: string | null
          reference?: string | null
          reversal_of?: string | null
          reversal_reason?: string | null
          reversed_by?: string | null
          row_version?: number
          source_id?: string | null
          source_table?: string | null
          status?: string
          updated_at?: string
          voucher_date?: string
          voucher_number?: string
          voucher_type?: Database["public"]["Enums"]["voucher_type"]
        }
        Relationships: [
          {
            foreignKeyName: "vouchers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vouchers_financial_year_id_fkey"
            columns: ["financial_year_id"]
            isOneToOne: false
            referencedRelation: "financial_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vouchers_reversal_of_fkey"
            columns: ["reversal_of"]
            isOneToOne: false
            referencedRelation: "vouchers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vouchers_reversed_by_fkey"
            columns: ["reversed_by"]
            isOneToOne: false
            referencedRelation: "vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_templates: {
        Row: {
          body_template: string | null
          created_at: string
          description: string | null
          event_key: string
          id: string
          is_active: boolean
          language_code: string
          template_name: string
          updated_at: string
          variables: Json
        }
        Insert: {
          body_template?: string | null
          created_at?: string
          description?: string | null
          event_key: string
          id?: string
          is_active?: boolean
          language_code?: string
          template_name: string
          updated_at?: string
          variables?: Json
        }
        Update: {
          body_template?: string | null
          created_at?: string
          description?: string | null
          event_key?: string
          id?: string
          is_active?: boolean
          language_code?: string
          template_name?: string
          updated_at?: string
          variables?: Json
        }
        Relationships: []
      }
    }
    Views: {
      ledger_balances: {
        Row: {
          closing_balance: number | null
          group_id: string | null
          group_name: string | null
          ledger_id: string | null
          name: string | null
          nature: Database["public"]["Enums"]["ledger_nature"] | null
          opening_balance: number | null
          opening_balance_type: string | null
          total_credit: number | null
          total_debit: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ledger_accounts_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "ledger_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      party_outstanding: {
        Row: {
          credit_limit: number | null
          name: string | null
          oldest_unpaid_date: string | null
          outstanding: number | null
          party_id: string | null
        }
        Relationships: []
      }
      stock_godown_summary: {
        Row: {
          code: string | null
          godown_id: string | null
          godown_name: string | null
          name: string | null
          qty: number | null
          stock_item_id: string | null
          unit: string | null
          value: number | null
        }
        Relationships: []
      }
      stock_summary: {
        Row: {
          avg_rate: number | null
          code: string | null
          current_qty: number | null
          max_stock: number | null
          min_stock: number | null
          name: string | null
          reorder_level: number | null
          stock_item_id: string | null
          stock_value: number | null
          unit: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _apply_raw_delta: {
        Args: { p_item: string; p_qty: number }
        Returns: undefined
      }
      _initialize_company_books_internal: {
        Args: { _company_id: string }
        Returns: string
      }
      approve_tally_migration_run: { Args: { p_run: string }; Returns: boolean }
      bill_outstanding: { Args: { p_bill: string }; Returns: number }
      check_voucher_balanced: {
        Args: { _voucher_id: string }
        Returns: undefined
      }
      create_company: {
        Args: {
          _address?: string
          _base_currency?: string
          _code: string
          _currency_symbol?: string
          _display_name: string
          _gstin?: string
          _legal_name: string
          _mailing_name?: string
          _pan?: string
          _state?: string
        }
        Returns: string
      }
      create_gl_voucher: {
        Args: {
          _date: string
          _entries: Json
          _idempotency_key?: string
          _narration?: string
          _reference?: string
          _type: Database["public"]["Enums"]["voucher_type"]
        }
        Returns: {
          id: string
          voucher_number: string
        }[]
      }
      create_gl_voucher_internal: {
        Args: {
          p_created_by?: string
          p_date: string
          p_entries: Json
          p_idempotency_key?: string
          p_narration?: string
          p_reference?: string
          p_source_id?: string
          p_source_table?: string
          p_type: Database["public"]["Enums"]["voucher_type"]
        }
        Returns: {
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          currency_code: string | null
          exchange_rate: number
          financial_year_id: string | null
          id: string
          idempotency_key: string | null
          is_locked: boolean
          narration: string | null
          posted_at: string
          posted_by: string | null
          reference: string | null
          reversal_of: string | null
          reversal_reason: string | null
          reversed_by: string | null
          row_version: number
          source_id: string | null
          source_table: string | null
          status: string
          updated_at: string
          voucher_date: string
          voucher_number: string
          voucher_type: Database["public"]["Enums"]["voucher_type"]
        }
        SetofOptions: {
          from: "*"
          to: "vouchers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_company_id: { Args: never; Returns: string }
      current_user_roles: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"][]
      }
      dispatch_sales_order: {
        Args: { p_godown: string; p_idempotency: string; p_order: string }
        Returns: number
      }
      ensure_invoice_bill: { Args: { p_invoice: string }; Returns: string }
      ensure_purchase_bill: { Args: { p_bill: string }; Returns: string }
      get_consolidated_trial_balance: {
        Args: { p_as_of?: string }
        Returns: {
          company_code: string
          company_id: string
          company_name: string
          credit: number
          debit: number
          group_name: string
          ledger_id: string
          ledger_name: string
        }[]
      }
      get_ledger_balances_period: {
        Args: { p_end: string; p_start: string }
        Returns: {
          closing_balance: number
          group_id: string
          group_name: string
          ledger_id: string
          name: string
          nature: string
          opening_balance: number
          opening_balance_type: string
          total_credit: number
          total_debit: number
        }[]
      }
      get_or_create_party_ledger: {
        Args: { _party_id: string }
        Returns: string
      }
      get_or_create_supplier_ledger: {
        Args: { _supplier_id: string }
        Returns: string
      }
      has_company_access: { Args: { _company_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      initialize_company_books: {
        Args: { _company_id: string }
        Returns: string
      }
      is_approved: { Args: { _user_id: string }; Returns: boolean }
      is_period_locked: { Args: { _d: string }; Returns: boolean }
      match_ai_document_chunks: {
        Args: {
          _embedding: string
          _match_count?: number
          _supplier_id?: string
        }
        Returns: {
          chunk_id: string
          content: string
          doc_kind: string
          document_id: string
          similarity: number
          title: string
        }[]
      }
      next_voucher_number: {
        Args: { _type: Database["public"]["Enums"]["voucher_type"] }
        Returns: string
      }
      post_bill_settlement: {
        Args: {
          p_allocations: Json
          p_cash_ledger: string
          p_date: string
          p_idempotency_key: string
          p_reference: string
          p_type: Database["public"]["Enums"]["voucher_type"]
        }
        Returns: string
      }
      post_intercompany_transaction: {
        Args: {
          p_amount: number
          p_date: string
          p_idempotency: string
          p_reference: string
          p_source_company: string
          p_source_credit_ledger: string
          p_source_debit_ledger: string
          p_target_company: string
          p_target_credit_ledger: string
          p_target_debit_ledger: string
        }
        Returns: string
      }
      post_stock_issue: {
        Args: {
          p_date: string
          p_godown: string
          p_item: string
          p_key: string
          p_movement_type?: Database["public"]["Enums"]["stock_movement_type"]
          p_qty: number
          p_source?: string
          p_source_id?: string
        }
        Returns: string
      }
      post_stock_production_output: {
        Args: {
          p_date: string
          p_godown: string
          p_item: string
          p_key: string
          p_qty: number
          p_rate: number
          p_source?: string
          p_source_id?: string
        }
        Returns: string
      }
      post_stock_receipt: {
        Args: {
          p_date: string
          p_godown: string
          p_item: string
          p_key: string
          p_qty: number
          p_rate: number
          p_source?: string
          p_source_id?: string
        }
        Returns: string
      }
      post_stock_transfer: {
        Args: {
          p_date: string
          p_from_godown: string
          p_item: string
          p_key: string
          p_qty: number
          p_to_godown: string
        }
        Returns: string
      }
      produce_sales_order_bom: {
        Args: { p_godown: string; p_idempotency: string; p_order: string }
        Returns: number
      }
      recalc_attendance_day: {
        Args: { _date: string; _employee_id: string }
        Returns: undefined
      }
      receive_purchase_bill: { Args: { p_bill: string }; Returns: string }
      receive_sales_order_finished_goods: {
        Args: { p_godown: string; p_idempotency: string; p_order: string }
        Returns: number
      }
      reconcile_tally_migration_run: {
        Args: { p_as_of?: string; p_run: string }
        Returns: {
          control_type: string
          difference: number
          erp_value: number
          status: string
          tally_value: number
          tolerance: number
        }[]
      }
      record_invoice_receipt: {
        Args: { p_amount: number; p_idempotency: string; p_invoice: string }
        Returns: number
      }
      refresh_canonical_bill_status: {
        Args: { p_bill: string }
        Returns: undefined
      }
      reserve_sales_order: {
        Args: { p_godown?: string; p_order: string }
        Returns: number
      }
      reverse_bill_settlement: {
        Args: { p_date: string; p_reason: string; p_voucher: string }
        Returns: string
      }
      reverse_gl_voucher: {
        Args: { p_date: string; p_reason: string; p_voucher: string }
        Returns: string
      }
      reverse_invoice: {
        Args: { p_idempotency: string; p_invoice: string }
        Returns: string
      }
      reverse_stock_movement: {
        Args: { p_date: string; p_key: string; p_movement: string }
        Returns: string
      }
      set_active_company: { Args: { _company_id: string }; Returns: string }
      set_user_company_access: {
        Args: { p_company_ids: string[]; p_user_id: string }
        Returns: {
          can_create: boolean
          can_delete: boolean
          can_edit: boolean
          can_view: boolean
          company_id: string
        }[]
      }
      snapshot_invoice_tax: { Args: { p_invoice: string }; Returns: undefined }
      stock_available: {
        Args: { p_godown?: string; p_item: string }
        Returns: number
      }
      stock_on_hand: {
        Args: { p_godown?: string; p_item: string }
        Returns: number
      }
      validate_tally_migration_run: {
        Args: { p_run: string }
        Returns: {
          bill_count: number
          critical_issues: number
          duplicate_source_ids: number
          out_run_id: string
          out_status: string
          total_rows: number
          unbalanced_vouchers: number
          voucher_count: number
          warning_issues: number
        }[]
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "sales"
        | "production"
        | "hr"
        | "customer"
        | "employee"
        | "accountant"
        | "vendor"
      attendance_status: "present" | "absent" | "half_day" | "leave" | "holiday"
      invoice_status: "draft" | "unpaid" | "partial" | "paid" | "cancelled"
      ledger_nature: "assets" | "liabilities" | "income" | "expenses"
      production_status:
        | "received"
        | "in_production"
        | "qc"
        | "ready"
        | "dispatched"
      punch_type: "in" | "out"
      stock_movement_type:
        | "purchase"
        | "sale"
        | "production_in"
        | "production_out"
        | "transfer_in"
        | "transfer_out"
        | "adjustment"
        | "opening"
      user_status: "pending" | "approved" | "rejected"
      valuation_method: "fifo" | "lifo" | "weighted_avg" | "standard_cost"
      voucher_type:
        | "sales"
        | "purchase"
        | "receipt"
        | "payment"
        | "contra"
        | "journal"
        | "debit_note"
        | "credit_note"
        | "stock_journal"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "admin",
        "sales",
        "production",
        "hr",
        "customer",
        "employee",
        "accountant",
        "vendor",
      ],
      attendance_status: ["present", "absent", "half_day", "leave", "holiday"],
      invoice_status: ["draft", "unpaid", "partial", "paid", "cancelled"],
      ledger_nature: ["assets", "liabilities", "income", "expenses"],
      production_status: [
        "received",
        "in_production",
        "qc",
        "ready",
        "dispatched",
      ],
      punch_type: ["in", "out"],
      stock_movement_type: [
        "purchase",
        "sale",
        "production_in",
        "production_out",
        "transfer_in",
        "transfer_out",
        "adjustment",
        "opening",
      ],
      user_status: ["pending", "approved", "rejected"],
      valuation_method: ["fifo", "lifo", "weighted_avg", "standard_cost"],
      voucher_type: [
        "sales",
        "purchase",
        "receipt",
        "payment",
        "contra",
        "journal",
        "debit_note",
        "credit_note",
        "stock_journal",
      ],
    },
  },
} as const
