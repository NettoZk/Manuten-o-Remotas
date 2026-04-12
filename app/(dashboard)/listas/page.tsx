"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { FieldGroup, Field, FieldLabel } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { toast } from "sonner"
import {
  getDefects,
  createDefect,
  updateDefect,
  deleteDefect,
  getServices,
  createService,
  updateService,
  deleteService,
  getOperators,
  createOperator,
  updateOperator,
  deleteOperator,
  getEquipmentSituations,
  createEquipmentSituation,
  updateEquipmentSituation,
  deleteEquipmentSituation,
} from "@/lib/services"
import { collection, onSnapshot, query } from "firebase/firestore"
import { db } from "@/lib/firebase"
import type { Defect, Service, Operator, EquipmentSituation } from "@/lib/types"
import { Settings, Plus, Pencil, Trash2, AlertTriangle, Wrench, Signal, MapPin } from "lucide-react"

type ListItem = Defect | Service | Operator

interface ListManagerProps {
  title: string
  description: string
  icon: React.ReactNode
  items: ListItem[]
  onAdd: (nome: string) => Promise<unknown>
  onUpdate: (id: string, data: Partial<ListItem>) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onRefresh: () => void
}

function ListManager({
  title,
  description,
  icon,
  items,
  onAdd,
  onUpdate,
  onDelete,
  onRefresh,
}: ListManagerProps) {
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [editingItem, setEditingItem] = useState<ListItem | null>(null)
  const [deletingItem, setDeletingItem] = useState<ListItem | null>(null)
  const [newItemName, setNewItemName] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const handleAdd = async () => {
    if (!newItemName.trim()) {
      toast.error("Digite um nome")
      return
    }

    setIsLoading(true)
    try {
      await onAdd(newItemName.trim())
      setNewItemName("")
      setShowAddDialog(false)
      onRefresh()
      toast.success("Item adicionado com sucesso")
    } catch (error) {
      console.error("Erro ao adicionar:", error)
      toast.error("Erro ao adicionar item")
    } finally {
      setIsLoading(false)
    }
  }

  const handleUpdate = async () => {
    if (!editingItem) return

    setIsLoading(true)
    try {
      await onUpdate(editingItem.id, { nome: editingItem.nome, ativo: editingItem.ativo })
      setEditingItem(null)
      onRefresh()
      toast.success("Item atualizado com sucesso")
    } catch (error) {
      console.error("Erro ao atualizar:", error)
      toast.error("Erro ao atualizar item")
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingItem) return

    setIsLoading(true)
    try {
      await onDelete(deletingItem.id)
      setDeletingItem(null)
      onRefresh()
      toast.success("Item excluído com sucesso")
    } catch (error) {
      console.error("Erro ao excluir:", error)
      toast.error("Erro ao excluir item")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              {icon}
              {title}
            </CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Adicionar
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Adicionar {title}</DialogTitle>
                <DialogDescription>Digite o nome do novo item</DialogDescription>
              </DialogHeader>
              <FieldGroup className="py-4">
                <Field>
                  <FieldLabel>Nome</FieldLabel>
                  <Input
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    placeholder="Nome do item"
                  />
                </Field>
              </FieldGroup>
              <DialogFooter>
                <Button onClick={handleAdd} disabled={isLoading}>
                  {isLoading ? <Spinner className="mr-2 h-4 w-4" /> : null}
                  Adicionar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-center text-muted-foreground py-4">
            Nenhum item cadastrado
          </p>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div className="flex items-center gap-3">
                  <span className="font-medium">{item.nome}</span>
                  <Badge variant={item.ativo ? "default" : "secondary"}>
                    {item.ativo ? "Ativo" : "Inativo"}
                  </Badge>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setEditingItem(item)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeletingItem(item)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={!!editingItem} onOpenChange={() => setEditingItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Item</DialogTitle>
            <DialogDescription>Atualize os dados do item</DialogDescription>
          </DialogHeader>
          {editingItem && (
            <FieldGroup className="py-4">
              <Field>
                <FieldLabel>Nome</FieldLabel>
                <Input
                  value={editingItem.nome}
                  onChange={(e) =>
                    setEditingItem({ ...editingItem, nome: e.target.value })
                  }
                />
              </Field>
              <Field>
                <FieldLabel>Status</FieldLabel>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={editingItem.ativo ? "ativo" : "inativo"}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      ativo: e.target.value === "ativo",
                    })
                  }
                >
                  <option value="ativo">Ativo</option>
                  <option value="inativo">Inativo</option>
                </select>
              </Field>
            </FieldGroup>
          )}
          <DialogFooter>
            <Button onClick={handleUpdate} disabled={isLoading}>
              {isLoading ? <Spinner className="mr-2 h-4 w-4" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingItem} onOpenChange={() => setDeletingItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Item</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir "{deletingItem?.nome}"? Esta ação
              não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

export default function ListsPage() {
  const [defects, setDefects] = useState<Defect[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [operators, setOperators] = useState<Operator[]>([])
  const [situations, setSituations] = useState<EquipmentSituation[]>([])
  const [loading, setLoading] = useState(true)

  const loadData = async () => {
    try {
      const [defectsData, servicesData, operatorsData, situationsData] = await Promise.all([
        getDefects(),
        getServices(),
        getOperators(),
        getEquipmentSituations(),
      ])
      setDefects(defectsData)
      setServices(servicesData)
      setOperators(operatorsData)
      setSituations(situationsData)
    } catch (error) {
      console.error("Erro ao carregar dados:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let readyCount = 0
    const markReady = () => {
      readyCount += 1
      if (readyCount === 4) {
        setLoading(false)
      }
    }

    const defectsQuery = query(collection(db, "defects"))
    const servicesQuery = query(collection(db, "services"))
    const operatorsQuery = query(collection(db, "operators"))
    const situationsQuery = query(collection(db, "equipment_status"))

    const unsubscribeDefects = onSnapshot(
      defectsQuery,
      (snapshot) => {
        setDefects(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Defect)))
        markReady()
      },
      (error) => {
        console.error("Erro ao carregar defeitos em tempo real:", error)
        markReady()
      }
    )

    const unsubscribeServices = onSnapshot(
      servicesQuery,
      (snapshot) => {
        setServices(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Service)))
        markReady()
      },
      (error) => {
        console.error("Erro ao carregar serviços em tempo real:", error)
        markReady()
      }
    )

    const unsubscribeOperators = onSnapshot(
      operatorsQuery,
      (snapshot) => {
        setOperators(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Operator)))
        markReady()
      },
      (error) => {
        console.error("Erro ao carregar operadoras em tempo real:", error)
        markReady()
      }
    )

    const unsubscribeSituations = onSnapshot(
      situationsQuery,
      (snapshot) => {
        setSituations(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as EquipmentSituation)))
        markReady()
      },
      (error) => {
        console.error("Erro ao carregar situações em tempo real:", error)
        markReady()
      }
    )

    return () => {
      unsubscribeDefects()
      unsubscribeServices()
      unsubscribeOperators()
      unsubscribeSituations()
    }
  }, [])

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Gerenciar Listas</h1>
        <p className="text-muted-foreground">
          Gerencie as listas de defeitos, serviços e operadoras
        </p>
      </div>

      <Tabs defaultValue="defects" className="space-y-6">
        <TabsList>
          <TabsTrigger value="defects">Defeitos</TabsTrigger>
          <TabsTrigger value="services">Serviços</TabsTrigger>
          <TabsTrigger value="operators">Operadoras</TabsTrigger>
          <TabsTrigger value="situations">Situações</TabsTrigger>
        </TabsList>

        <TabsContent value="defects">
          <ListManager
            title="Defeitos"
            description="Lista de defeitos que podem ser relatados ou encontrados"
            icon={<AlertTriangle className="h-5 w-5" />}
            items={defects}
            onAdd={createDefect}
            onUpdate={updateDefect}
            onDelete={deleteDefect}
            onRefresh={loadData}
          />
        </TabsContent>

        <TabsContent value="services">
          <ListManager
            title="Serviços"
            description="Lista de serviços que podem ser realizados"
            icon={<Wrench className="h-5 w-5" />}
            items={services}
            onAdd={createService}
            onUpdate={updateService}
            onDelete={deleteService}
            onRefresh={loadData}
          />
        </TabsContent>

        <TabsContent value="operators">
          <ListManager
            title="Operadoras"
            description="Lista de operadoras de telecomunicações"
            icon={<Signal className="h-5 w-5" />}
            items={operators}
            onAdd={createOperator}
            onUpdate={updateOperator}
            onDelete={deleteOperator}
            onRefresh={loadData}
          />
        </TabsContent>

        <TabsContent value="situations">
          <ListManager
            title="Situações da Remota"
            description="Lista de situações que podem ser atribuídas às remotas após manutenção"
            icon={<MapPin className="h-5 w-5" />}
            items={situations}
            onAdd={createEquipmentSituation}
            onUpdate={updateEquipmentSituation}
            onDelete={deleteEquipmentSituation}
            onRefresh={loadData}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
