"use client";
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Upload, Search, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
type Item = { id: string; question: string; options: { text: string }[]; createdBy: { name: string } };
export default function QuestionLibraryPage() {
 const router=useRouter(), params=useSearchParams(); const [items,setItems]=React.useState<Item[]>([]),[search,setSearch]=React.useState(""),[file,setFile]=React.useState<File>();
 React.useEffect(()=>{fetch('/api/v1/questions').then(r=>r.json()).then(r=>setItems(r.data?.items??[]));},[]);
 async function upload(){if(!file)return;const f=new FormData();f.set('file',file);const r=await fetch('/api/v1/questions',{method:'PUT',body:f});if(r.ok)router.refresh();else alert((await r.json()).error?.message);}
 const visible=items.filter(i=>`${i.question} ${i.options.map(o=>o.text).join(' ')}`.toLowerCase().includes(search.toLowerCase()));
 return <div className="mx-auto flex max-w-5xl flex-col gap-6"><div><h1 className="text-2xl font-semibold">Question library</h1><p className="text-sm text-muted-foreground">Shared reusable multiple-choice questions for Coaches and Super Admins.</p></div><div className="rounded-xl border p-5"><h2 className="font-medium">Upload questions</h2><p className="mt-1 text-sm text-muted-foreground">CSV or Excel columns: Question, Option1, Option2, up to Option8.</p><div className="mt-4 flex flex-col gap-3 sm:flex-row"><Input type="file" accept=".csv,.xlsx,.xls" onChange={e=>setFile(e.target.files?.[0])}/><Button onClick={upload}><Upload className="size-4"/>Upload and save</Button></div></div><div className="relative"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground"/><Input className="pl-9" placeholder="Search saved questions" value={search} onChange={e=>setSearch(e.target.value)}/></div><div className="grid gap-3">{visible.map(item=><div key={item.id} className="rounded-xl border p-4"><p className="font-medium">{item.question}</p><p className="mt-2 text-sm text-muted-foreground">{item.options.map(o=>o.text).join(' · ')}</p><div className="mt-3 flex items-center justify-between"><span className="text-xs text-muted-foreground">Saved by {item.createdBy.name}</span><Button size="sm" onClick={()=>{sessionStorage.setItem('cms-poll-template',JSON.stringify({question:item.question,options:item.options.map(o=>o.text)}));router.push(params.get('returnTo')||'/chat')}}><CheckCircle2 className="size-4"/>Use question</Button></div></div>)}</div></div>;
}
