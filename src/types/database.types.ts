export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      bulk_upload_sessions: {
        Row: {
          collection_id: string;
          completed_at: string | null;
          created_at: string;
          error_log: Json;
          expires_at: string;
          files: Json;
          id: string;
          last_activity_at: string;
          status: string;
          user_id: string;
        };
        Insert: {
          collection_id: string;
          completed_at?: string | null;
          created_at?: string;
          error_log?: Json;
          expires_at: string;
          files?: Json;
          id?: string;
          last_activity_at?: string;
          status?: string;
          user_id: string;
        };
        Update: {
          collection_id?: string;
          completed_at?: string | null;
          created_at?: string;
          error_log?: Json;
          expires_at?: string;
          files?: Json;
          id?: string;
          last_activity_at?: string;
          status?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'bulk_upload_sessions_collection_id_fkey';
            columns: ['collection_id'];
            isOneToOne: false;
            referencedRelation: 'collections';
            referencedColumns: ['id'];
          },
        ];
      };
      collection_papers: {
        Row: {
          collection_id: string;
          paper_id: string;
          relationship_type: string | null;
          similarity_score: number | null;
          source_paper_id: string | null;
        };
        Insert: {
          collection_id: string;
          paper_id: string;
          relationship_type?: string | null;
          similarity_score?: number | null;
          source_paper_id?: string | null;
        };
        Update: {
          collection_id?: string;
          paper_id?: string;
          relationship_type?: string | null;
          similarity_score?: number | null;
          source_paper_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'collection_papers_collection_id_fkey';
            columns: ['collection_id'];
            isOneToOne: false;
            referencedRelation: 'collections';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'collection_papers_paper_id_fkey';
            columns: ['paper_id'];
            isOneToOne: false;
            referencedRelation: 'papers';
            referencedColumns: ['paper_id'];
          },
          {
            foreignKeyName: 'collection_papers_source_paper_id_fkey';
            columns: ['source_paper_id'];
            isOneToOne: false;
            referencedRelation: 'papers';
            referencedColumns: ['paper_id'];
          },
        ];
      };
      collections: {
        Row: {
          candidate_count: number | null;
          copy_count: number | null;
          created_at: string | null;
          filters: Json | null;
          id: string;
          is_public: boolean | null;
          last_updated_at: string | null;
          name: string;
          natural_language_query: string | null;
          search_query: string;
          similarity_threshold: number | null;
          use_ai_assistant: boolean | null;
          user_id: string;
        };
        Insert: {
          candidate_count?: number | null;
          copy_count?: number | null;
          created_at?: string | null;
          filters?: Json | null;
          id?: string;
          is_public?: boolean | null;
          last_updated_at?: string | null;
          name: string;
          natural_language_query?: string | null;
          search_query: string;
          similarity_threshold?: number | null;
          use_ai_assistant?: boolean | null;
          user_id: string;
        };
        Update: {
          candidate_count?: number | null;
          copy_count?: number | null;
          created_at?: string | null;
          filters?: Json | null;
          id?: string;
          is_public?: boolean | null;
          last_updated_at?: string | null;
          name?: string;
          natural_language_query?: string | null;
          search_query?: string;
          similarity_threshold?: number | null;
          use_ai_assistant?: boolean | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'collections_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      conversations: {
        Row: {
          collection_id: string;
          created_at: string | null;
          id: string;
          last_message_at: string | null;
          title: string | null;
          user_id: string;
        };
        Insert: {
          collection_id: string;
          created_at?: string | null;
          id?: string;
          last_message_at?: string | null;
          title?: string | null;
          user_id: string;
        };
        Update: {
          collection_id?: string;
          created_at?: string | null;
          id?: string;
          last_message_at?: string | null;
          title?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'conversations_collection_id_fkey';
            columns: ['collection_id'];
            isOneToOne: false;
            referencedRelation: 'collections';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'conversations_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      messages: {
        Row: {
          cited_papers: Json | null;
          content: string;
          conversation_id: string;
          id: string;
          role: string;
          timestamp: string | null;
        };
        Insert: {
          cited_papers?: Json | null;
          content: string;
          conversation_id: string;
          id?: string;
          role: string;
          timestamp?: string | null;
        };
        Update: {
          cited_papers?: Json | null;
          content?: string;
          conversation_id?: string;
          id?: string;
          role?: string;
          timestamp?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'messages_conversation_id_fkey';
            columns: ['conversation_id'];
            isOneToOne: false;
            referencedRelation: 'conversations';
            referencedColumns: ['id'];
          },
        ];
      };
      paper_chunks: {
        Row: {
          chunk_index: number;
          collection_id: string;
          content: string;
          content_tsv: unknown;
          created_at: string | null;
          embedding: string;
          id: string;
          paper_id: string;
          token_count: number;
        };
        Insert: {
          chunk_index: number;
          collection_id: string;
          content: string;
          content_tsv?: unknown;
          created_at?: string | null;
          embedding: string;
          id?: string;
          paper_id: string;
          token_count: number;
        };
        Update: {
          chunk_index?: number;
          collection_id?: string;
          content?: string;
          content_tsv?: unknown;
          created_at?: string | null;
          embedding?: string;
          id?: string;
          paper_id?: string;
          token_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'paper_chunks_collection_id_fkey';
            columns: ['collection_id'];
            isOneToOne: false;
            referencedRelation: 'collections';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'paper_chunks_paper_id_fkey';
            columns: ['paper_id'];
            isOneToOne: false;
            referencedRelation: 'papers';
            referencedColumns: ['paper_id'];
          },
        ];
      };
      papers: {
        Row: {
          abstract: string | null;
          authors: Json | null;
          citation_count: number | null;
          created_at: string | null;
          open_access_pdf_url: string | null;
          paper_id: string;
          pdf_source: string | null;
          storage_path: string | null;
          title: string;
          uploaded_by: string | null;
          vector_status: string | null;
          venue: string | null;
          year: number | null;
        };
        Insert: {
          abstract?: string | null;
          authors?: Json | null;
          citation_count?: number | null;
          created_at?: string | null;
          open_access_pdf_url?: string | null;
          paper_id: string;
          pdf_source?: string | null;
          storage_path?: string | null;
          title: string;
          uploaded_by?: string | null;
          vector_status?: string | null;
          venue?: string | null;
          year?: number | null;
        };
        Update: {
          abstract?: string | null;
          authors?: Json | null;
          citation_count?: number | null;
          created_at?: string | null;
          open_access_pdf_url?: string | null;
          paper_id?: string;
          pdf_source?: string | null;
          storage_path?: string | null;
          title?: string;
          uploaded_by?: string | null;
          vector_status?: string | null;
          venue?: string | null;
          year?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'papers_uploaded_by_fkey';
            columns: ['uploaded_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      users: {
        Row: {
          created_at: string | null;
          email: string;
          id: string;
          name: string | null;
        };
        Insert: {
          created_at?: string | null;
          email: string;
          id: string;
          name?: string | null;
        };
        Update: {
          created_at?: string | null;
          email?: string;
          id?: string;
          name?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      hybrid_search: {
        Args: {
          p_collection_id: string;
          p_limit?: number;
          p_query_embedding: string;
          p_query_text: string;
          p_semantic_weight?: number;
        };
        Returns: {
          chunk_id: string;
          chunk_index: number;
          combined_score: number;
          content: string;
          keyword_score: number;
          paper_id: string;
          semantic_score: number;
        }[];
      };
      update_bulk_upload_file: {
        Args: { p_file_id: string; p_session_id: string; p_update: Json };
        Returns: undefined;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  'public'
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] &
        DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] &
        DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
