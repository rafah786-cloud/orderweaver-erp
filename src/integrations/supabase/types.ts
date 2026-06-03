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
      attendance: {
        Row: {
          attendance_date: string
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
            foreignKeyName: "attendance_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_centers: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          parent_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          parent_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          parent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cost_centers_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      device_settings: {
        Row: {
          api_key_hash: string
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
        Relationships: []
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
      employees: {
        Row: {
          basic_salary: number
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
        Relationships: []
      }
      financial_years: {
        Row: {
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
          created_at?: string
          end_date?: string
          id?: string
          is_current?: boolean
          is_locked?: boolean
          name?: string
          start_date?: string
          updated_at?: string
        }
        Relationships: []
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
      invoice_items: {
        Row: {
          amount: number | null
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
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          created_at: string
          created_by: string | null
          dispatch_pincode: string | null
          dispatch_state_code: string | null
          due_date: string | null
          export_type: string | null
          id: string
          invoice_date: string
          invoice_number: string
          invoice_type: string
          notes: string | null
          paid_amount: number
          party_id: string
          place_of_supply: string | null
          reverse_charge: boolean
          sales_order_id: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal: number
          supplier_gstin: string | null
          tax_amount: number
          total_amount: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          dispatch_pincode?: string | null
          dispatch_state_code?: string | null
          due_date?: string | null
          export_type?: string | null
          id?: string
          invoice_date?: string
          invoice_number: string
          invoice_type?: string
          notes?: string | null
          paid_amount?: number
          party_id: string
          place_of_supply?: string | null
          reverse_charge?: boolean
          sales_order_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          supplier_gstin?: string | null
          tax_amount?: number
          total_amount?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          dispatch_pincode?: string | null
          dispatch_state_code?: string | null
          due_date?: string | null
          export_type?: string | null
          id?: string
          invoice_date?: string
          invoice_number?: string
          invoice_type?: string
          notes?: string | null
          paid_amount?: number
          party_id?: string
          place_of_supply?: string | null
          reverse_charge?: boolean
          sales_order_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          supplier_gstin?: string | null
          tax_amount?: number
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
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
          id: string
          model_id: string
          quantity_per_unit: number
          raw_material_id: string
        }
        Insert: {
          id?: string
          model_id: string
          quantity_per_unit?: number
          raw_material_id: string
        }
        Update: {
          id?: string
          model_id?: string
          quantity_per_unit?: number
          raw_material_id?: string
        }
        Relationships: [
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
      parties: {
        Row: {
          address: string | null
          contact_person: string | null
          created_at: string
          credit_limit: number
          current_balance: number
          email: string | null
          gstin: string | null
          id: string
          name: string
          notes: string | null
          opening_balance: number
          owner_id: string | null
          phone: string | null
          pin_code: string | null
          state_code: string | null
          tally_name: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address?: string | null
          contact_person?: string | null
          created_at?: string
          credit_limit?: number
          current_balance?: number
          email?: string | null
          gstin?: string | null
          id?: string
          name: string
          notes?: string | null
          opening_balance?: number
          owner_id?: string | null
          phone?: string | null
          pin_code?: string | null
          state_code?: string | null
          tally_name?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address?: string | null
          contact_person?: string | null
          created_at?: string
          credit_limit?: number
          current_balance?: number
          email?: string | null
          gstin?: string | null
          id?: string
          name?: string
          notes?: string | null
          opening_balance?: number
          owner_id?: string | null
          phone?: string | null
          pin_code?: string | null
          state_code?: string | null
          tally_name?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
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
        Relationships: []
      }
      production_orders: {
        Row: {
          assigned_to: string | null
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
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
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
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
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
          updated_at?: string
        }
        Relationships: [
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
        Relationships: []
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
          id: string
          purchase_bill_id: string
          quantity: number
          raw_material_id: string
          unit_price: number
        }
        Insert: {
          amount?: number | null
          id?: string
          purchase_bill_id: string
          quantity?: number
          raw_material_id: string
          unit_price?: number
        }
        Update: {
          amount?: number | null
          id?: string
          purchase_bill_id?: string
          quantity?: number
          raw_material_id?: string
          unit_price?: number
        }
        Relationships: [
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
          created_at: string
          created_by: string | null
          eligibility_for_itc: string
          id: string
          invoice_type: string
          notes: string | null
          place_of_supply: string | null
          reverse_charge: boolean
          subtotal: number
          supplier_gstin: string | null
          supplier_id: string | null
          tax_amount: number
          total_amount: number
          updated_at: string
        }
        Insert: {
          bill_date?: string
          bill_number: string
          created_at?: string
          created_by?: string | null
          eligibility_for_itc?: string
          id?: string
          invoice_type?: string
          notes?: string | null
          place_of_supply?: string | null
          reverse_charge?: boolean
          subtotal?: number
          supplier_gstin?: string | null
          supplier_id?: string | null
          tax_amount?: number
          total_amount?: number
          updated_at?: string
        }
        Update: {
          bill_date?: string
          bill_number?: string
          created_at?: string
          created_by?: string | null
          eligibility_for_itc?: string
          id?: string
          invoice_type?: string
          notes?: string | null
          place_of_supply?: string | null
          reverse_charge?: boolean
          subtotal?: number
          supplier_gstin?: string | null
          supplier_id?: string | null
          tax_amount?: number
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
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
          created_at?: string
          current_stock?: number
          id?: string
          name?: string
          notes?: string | null
          reorder_level?: number
          unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      sales_order_items: {
        Row: {
          amount: number | null
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
          created_at: string
          created_by: string | null
          expected_delivery: string | null
          id: string
          notes: string | null
          order_date: string
          order_number: string
          party_id: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expected_delivery?: string | null
          id?: string
          notes?: string | null
          order_date?: string
          order_number: string
          party_id: string
          total_amount?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expected_delivery?: string | null
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
          created_at: string
          current_balance: number
          email: string | null
          gstin: string | null
          id: string
          name: string
          notes: string | null
          opening_balance: number
          phone: string | null
          tally_name: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          current_balance?: number
          email?: string | null
          gstin?: string | null
          id?: string
          name: string
          notes?: string | null
          opening_balance?: number
          phone?: string | null
          tally_name?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          current_balance?: number
          email?: string | null
          gstin?: string | null
          id?: string
          name?: string
          notes?: string | null
          opening_balance?: number
          phone?: string | null
          tally_name?: string | null
          updated_at?: string
        }
        Relationships: []
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
      voucher_entries: {
        Row: {
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
          id: string
          next_number: number
          prefix: string
          suffix: string
          updated_at: string
          voucher_type: Database["public"]["Enums"]["voucher_type"]
          width: number
        }
        Insert: {
          id?: string
          next_number?: number
          prefix?: string
          suffix?: string
          updated_at?: string
          voucher_type: Database["public"]["Enums"]["voucher_type"]
          width?: number
        }
        Update: {
          id?: string
          next_number?: number
          prefix?: string
          suffix?: string
          updated_at?: string
          voucher_type?: Database["public"]["Enums"]["voucher_type"]
          width?: number
        }
        Relationships: []
      }
      vouchers: {
        Row: {
          created_at: string
          created_by: string | null
          financial_year_id: string | null
          id: string
          is_locked: boolean
          narration: string | null
          reference: string | null
          source_id: string | null
          source_table: string | null
          updated_at: string
          voucher_date: string
          voucher_number: string
          voucher_type: Database["public"]["Enums"]["voucher_type"]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          financial_year_id?: string | null
          id?: string
          is_locked?: boolean
          narration?: string | null
          reference?: string | null
          source_id?: string | null
          source_table?: string | null
          updated_at?: string
          voucher_date?: string
          voucher_number: string
          voucher_type: Database["public"]["Enums"]["voucher_type"]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          financial_year_id?: string | null
          id?: string
          is_locked?: boolean
          narration?: string | null
          reference?: string | null
          source_id?: string | null
          source_table?: string | null
          updated_at?: string
          voucher_date?: string
          voucher_number?: string
          voucher_type?: Database["public"]["Enums"]["voucher_type"]
        }
        Relationships: [
          {
            foreignKeyName: "vouchers_financial_year_id_fkey"
            columns: ["financial_year_id"]
            isOneToOne: false
            referencedRelation: "financial_years"
            referencedColumns: ["id"]
          },
        ]
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
    }
    Functions: {
      check_voucher_balanced: {
        Args: { _voucher_id: string }
        Returns: undefined
      }
      current_user_roles: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"][]
      }
      get_or_create_party_ledger: {
        Args: { _party_id: string }
        Returns: string
      }
      get_or_create_supplier_ledger: {
        Args: { _supplier_id: string }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_approved: { Args: { _user_id: string }; Returns: boolean }
      next_voucher_number: {
        Args: { _type: Database["public"]["Enums"]["voucher_type"] }
        Returns: string
      }
      recalc_attendance_day: {
        Args: { _date: string; _employee_id: string }
        Returns: undefined
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
      user_status: "pending" | "approved" | "rejected"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      user_status: ["pending", "approved", "rejected"],
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
