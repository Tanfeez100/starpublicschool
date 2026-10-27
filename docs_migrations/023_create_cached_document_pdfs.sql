-- ========================================================================
-- Migration: 023_create_cached_document_pdfs.sql
-- Description: Dedicated table to store on-demand cached PDFs for student results and fee bills
-- Run this in Supabase SQL Editor
-- ========================================================================

CREATE TABLE IF NOT EXISTS public.cached_document_pdfs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_type VARCHAR(50) NOT NULL DEFAULT 'result', -- 'result' or 'bill'
    cache_key VARCHAR(255) NOT NULL UNIQUE,         -- e.g. 'res_2026_c1_sa_r5_tfirst' or 'bill_uuid'
    student_id UUID REFERENCES public.students(id) ON DELETE CASCADE,
    bill_id UUID REFERENCES public.fee_bills(id) ON DELETE CASCADE,
    session VARCHAR(50),
    class_name VARCHAR(50),
    section VARCHAR(20),
    roll_no VARCHAR(50),
    terminal VARCHAR(50),
    pdf_url TEXT NOT NULL,
    local_path TEXT,
    provider VARCHAR(50) DEFAULT 'cloudinary',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fast lookup indexes
CREATE INDEX IF NOT EXISTS idx_cached_pdfs_cache_key ON public.cached_document_pdfs(cache_key);
CREATE INDEX IF NOT EXISTS idx_cached_pdfs_student_term ON public.cached_document_pdfs(student_id, terminal);
CREATE INDEX IF NOT EXISTS idx_cached_pdfs_bill_id ON public.cached_document_pdfs(bill_id);

-- Enable Row Level Security (RLS)
ALTER TABLE public.cached_document_pdfs ENABLE ROW LEVEL SECURITY;

-- Allow public / service read
CREATE POLICY "Public read for cached PDFs"
ON public.cached_document_pdfs
FOR SELECT
USING (true);

-- Allow authenticated / service role full access
CREATE POLICY "Service full access for cached PDFs"
ON public.cached_document_pdfs
FOR ALL
USING (true)
WITH CHECK (true);
