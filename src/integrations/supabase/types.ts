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
          id: string
          invoice_date: string
          invoice_number: string
          notes: string | null
          paid_amount: number
          party_id: string
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
          id?: string
          invoice_date?: string
          invoice_number: string
          notes?: string | null
          paid_amount?: number
          party_id: string
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
          id?: string
          invoice_date?: string
          invoice_number?: string
          notes?: string | null
          paid_amount?: number
          party_id?: string
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
          email: string | null
          gstin: string | null
          id: string
          name: string
          notes: string | null
          owner_id: string | null
          phone: string | null
          pin_code: string | null
          state_code: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address?: string | null
          contact_person?: string | null
          created_at?: string
          credit_limit?: number
          email?: string | null
          gstin?: string | null
          id?: string
          name: string
          notes?: string | null
          owner_id?: string | null
          phone?: string | null
          pin_code?: string | null
          state_code?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address?: string | null
          contact_person?: string | null
          created_at?: string
          credit_limit?: number
          email?: string | null
          gstin?: string | null
          id?: string
          name?: string
          notes?: string | null
          owner_id?: string | null
          phone?: string | null
          pin_code?: string | null
          state_code?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
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
          id: string
          notes: string | null
          supplier_id: string | null
          total_amount: number
          updated_at: string
        }
        Insert: {
          bill_date?: string
          bill_number: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          supplier_id?: string | null
          total_amount?: number
          updated_at?: string
        }
        Update: {
          bill_date?: string
          bill_number?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          supplier_id?: string | null
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
      suppliers: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          gstin: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          gstin?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          gstin?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
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
    }
    Views: {
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
      current_user_roles: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"][]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_approved: { Args: { _user_id: string }; Returns: boolean }
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
      attendance_status: "present" | "absent" | "half_day" | "leave" | "holiday"
      invoice_status: "draft" | "unpaid" | "partial" | "paid" | "cancelled"
      production_status:
        | "received"
        | "in_production"
        | "qc"
        | "ready"
        | "dispatched"
      punch_type: "in" | "out"
      user_status: "pending" | "approved" | "rejected"
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
      app_role: ["admin", "sales", "production", "hr", "customer", "employee"],
      attendance_status: ["present", "absent", "half_day", "leave", "holiday"],
      invoice_status: ["draft", "unpaid", "partial", "paid", "cancelled"],
      production_status: [
        "received",
        "in_production",
        "qc",
        "ready",
        "dispatched",
      ],
      punch_type: ["in", "out"],
      user_status: ["pending", "approved", "rejected"],
    },
  },
} as const
