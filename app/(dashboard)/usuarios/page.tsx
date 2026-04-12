"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
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
import { collection, onSnapshot, query } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { getUsers, createUser, updateUser, deleteUser, updateUserPassword } from "@/lib/services"
import type { User, UserRole } from "@/lib/types"
import { Users, Plus, Pencil, Trash2, Key } from "lucide-react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"

const roleLabels: Record<UserRole, string> = {
  admin: "Administrador",
  tecnico: "Tecnico",
  usuario: "Usuario",
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewDialog, setShowNewDialog] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [changingPasswordUser, setChangingPasswordUser] = useState<User | null>(null)
  const [deletingUser, setDeletingUser] = useState<User | null>(null)

  const loadUsers = async () => {
    try {
      const data = await getUsers()
      setUsers(data)
    } catch (error) {
      console.error("[v0] Erro ao carregar usuarios:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const usersQuery = query(collection(db, "users"))
    const unsubscribe = onSnapshot(
      usersQuery,
      (snapshot) => {
        setUsers(
          snapshot.docs.map((doc) => {
            const data = doc.data()
            return {
              id: doc.id,
              ...data,
              criadoEm: data.criadoEm?.toDate?.() || new Date(),
            } as User
          })
        )
        setLoading(false)
      },
      (error) => {
        console.error("Erro ao carregar usuários em tempo real:", error)
        setLoading(false)
      }
    )

    return () => unsubscribe()
  }, [])

  const handleUserCreated = () => {
    setShowNewDialog(false)
    loadUsers()
    toast.success("Usuario criado com sucesso")
  }

  const handleUserUpdated = () => {
    setEditingUser(null)
    loadUsers()
    toast.success("Usuario atualizado com sucesso")
  }

  const handlePasswordChanged = () => {
    setChangingPasswordUser(null)
    toast.success("Senha alterada com sucesso")
  }

  const handleDeleteUser = async () => {
    if (!deletingUser) return

    try {
      await deleteUser(deletingUser.id)
      loadUsers()
      toast.success("Usuario excluido com sucesso")
    } catch (error) {
      console.error("[v0] Erro ao excluir usuario:", error)
      toast.error("Erro ao excluir usuario")
    } finally {
      setDeletingUser(null)
    }
  }

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Spinner className="h-8 w-8 text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Usuarios</h1>
          <p className="text-muted-foreground">
            Gerencie os usuarios do sistema
          </p>
        </div>
        <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Novo Usuario
            </Button>
          </DialogTrigger>
          <DialogContent>
            <NewUserForm onSuccess={handleUserCreated} />
          </DialogContent>
        </Dialog>
      </div>

      <Card className="border-border/50 bg-card">
        <CardHeader className="border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Usuarios Cadastrados</CardTitle>
              <CardDescription>{users.length} usuario(s)</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          {users.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Nenhum usuario cadastrado
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/50 text-left">
                    <th className="pb-3 font-medium text-muted-foreground">Nome</th>
                    <th className="pb-3 font-medium text-muted-foreground">Usuario</th>
                    <th className="pb-3 font-medium text-muted-foreground">Tipo</th>
                    <th className="pb-3 font-medium text-muted-foreground">Status</th>
                    <th className="pb-3 font-medium text-muted-foreground">Cadastro</th>
                    <th className="pb-3 font-medium text-muted-foreground text-right">Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-b border-border/50 last:border-0">
                      <td className="py-3 font-medium text-foreground">{user.nome}</td>
                      <td className="py-3 text-muted-foreground">@{user.username}</td>
                      <td className="py-3">
                        <Badge variant="outline" className="font-normal">
                          {roleLabels[user.tipo]}
                        </Badge>
                      </td>
                      <td className="py-3">
                        <Badge 
                          variant={user.ativo ? "default" : "secondary"}
                          className={user.ativo ? "bg-green-500/10 text-green-500 hover:bg-green-500/20" : ""}
                        >
                          {user.ativo ? "Ativo" : "Inativo"}
                        </Badge>
                      </td>
                      <td className="py-3 text-sm text-muted-foreground">
                        {format(user.criadoEm, "dd/MM/yyyy", { locale: ptBR })}
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setChangingPasswordUser(user)}
                            title="Alterar senha"
                          >
                            <Key className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setEditingUser(user)}
                            title="Editar"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeletingUser(user)}
                            title="Excluir"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editingUser} onOpenChange={() => setEditingUser(null)}>
        <DialogContent>
          {editingUser && (
            <EditUserForm user={editingUser} onSuccess={handleUserUpdated} />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!changingPasswordUser} onOpenChange={() => setChangingPasswordUser(null)}>
        <DialogContent>
          {changingPasswordUser && (
            <ChangePasswordForm user={changingPasswordUser} onSuccess={handlePasswordChanged} />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingUser} onOpenChange={() => setDeletingUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Usuario</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o usuario {deletingUser?.nome}? Esta
              acao nao pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteUser}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function NewUserForm({ onSuccess }: { onSuccess: () => void }) {
  const [isLoading, setIsLoading] = useState(false)
  const [nome, setNome] = useState("")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [tipo, setTipo] = useState<UserRole>("usuario")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!nome || !username || !password) {
      toast.error("Preencha todos os campos")
      return
    }

    if (username.length < 3) {
      toast.error("O usuario deve ter pelo menos 3 caracteres")
      return
    }

    if (password.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres")
      return
    }

    setIsLoading(true)
    try {
      await createUser(username, password, nome, tipo)
      onSuccess()
    } catch (error: unknown) {
      console.error("[v0] Erro ao criar usuario:", error)
      if (error instanceof Error) {
        toast.error(error.message)
      } else {
        toast.error("Erro ao criar usuario")
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Novo Usuario</DialogTitle>
        <DialogDescription>
          Preencha os dados para criar um novo usuario
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit}>
        <FieldGroup className="py-4">
          <Field>
            <FieldLabel className="text-sm text-muted-foreground">Nome</FieldLabel>
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome completo"
              required
              className="h-11 bg-secondary/50"
            />
          </Field>
          <Field>
            <FieldLabel className="text-sm text-muted-foreground">Nome de usuario</FieldLabel>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value.replace(/\s/g, "").toLowerCase())}
              placeholder="usuario"
              required
              className="h-11 bg-secondary/50 lowercase"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Sera usado para fazer login (sem espacos)
            </p>
          </Field>
          <Field>
            <FieldLabel className="text-sm text-muted-foreground">Senha</FieldLabel>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimo 6 caracteres"
              required
              className="h-11 bg-secondary/50"
            />
          </Field>
          <Field>
            <FieldLabel className="text-sm text-muted-foreground">Tipo</FieldLabel>
            <select
              className="flex h-11 w-full rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={tipo}
              onChange={(e) => setTipo(e.target.value as UserRole)}
            >
              <option value="admin">Administrador</option>
              <option value="tecnico">Tecnico</option>
              <option value="usuario">Usuario</option>
            </select>
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button type="submit" disabled={isLoading} className="h-11">
            {isLoading ? <Spinner className="mr-2 h-4 w-4" /> : null}
            Criar Usuario
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}

function EditUserForm({
  user,
  onSuccess,
}: {
  user: User
  onSuccess: () => void
}) {
  const [isLoading, setIsLoading] = useState(false)
  const [nome, setNome] = useState(user.nome)
  const [tipo, setTipo] = useState<UserRole>(user.tipo)
  const [ativo, setAtivo] = useState(user.ativo)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    setIsLoading(true)
    try {
      await updateUser(user.id, { nome, tipo, ativo })
      onSuccess()
    } catch (error) {
      console.error("[v0] Erro ao atualizar usuario:", error)
      toast.error("Erro ao atualizar usuario")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Editar Usuario</DialogTitle>
        <DialogDescription>Atualize os dados do usuario</DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit}>
        <FieldGroup className="py-4">
          <Field>
            <FieldLabel className="text-sm text-muted-foreground">Usuario</FieldLabel>
            <Input value={`@${user.username}`} disabled className="h-11 bg-secondary/30" />
          </Field>
          <Field>
            <FieldLabel className="text-sm text-muted-foreground">Nome</FieldLabel>
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              required
              className="h-11 bg-secondary/50"
            />
          </Field>
          <Field>
            <FieldLabel className="text-sm text-muted-foreground">Tipo</FieldLabel>
            <select
              className="flex h-11 w-full rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={tipo}
              onChange={(e) => setTipo(e.target.value as UserRole)}
            >
              <option value="admin">Administrador</option>
              <option value="tecnico">Tecnico</option>
              <option value="usuario">Usuario</option>
            </select>
          </Field>
          <Field>
            <FieldLabel className="text-sm text-muted-foreground">Status</FieldLabel>
            <select
              className="flex h-11 w-full rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={ativo ? "ativo" : "inativo"}
              onChange={(e) => setAtivo(e.target.value === "ativo")}
            >
              <option value="ativo">Ativo</option>
              <option value="inativo">Inativo</option>
            </select>
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button type="submit" disabled={isLoading} className="h-11">
            {isLoading ? <Spinner className="mr-2 h-4 w-4" /> : null}
            Salvar
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}

function ChangePasswordForm({
  user,
  onSuccess,
}: {
  user: User
  onSuccess: () => void
}) {
  const [isLoading, setIsLoading] = useState(false)
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (password !== confirmPassword) {
      toast.error("As senhas nao coincidem")
      return
    }

    if (password.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres")
      return
    }

    setIsLoading(true)
    try {
      await updateUserPassword(user.id, password)
      onSuccess()
    } catch (error) {
      console.error("[v0] Erro ao alterar senha:", error)
      toast.error("Erro ao alterar senha")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Alterar Senha</DialogTitle>
        <DialogDescription>
          Defina uma nova senha para o usuario {user.nome}
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit}>
        <FieldGroup className="py-4">
          <Field>
            <FieldLabel className="text-sm text-muted-foreground">Nova Senha</FieldLabel>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimo 6 caracteres"
              required
              className="h-11 bg-secondary/50"
            />
          </Field>
          <Field>
            <FieldLabel className="text-sm text-muted-foreground">Confirmar Senha</FieldLabel>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repita a senha"
              required
              className="h-11 bg-secondary/50"
            />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button type="submit" disabled={isLoading} className="h-11">
            {isLoading ? <Spinner className="mr-2 h-4 w-4" /> : null}
            Alterar Senha
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}
