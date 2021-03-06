import { Injectable } from '@angular/core';
import {Task} from "../Task";
import {HttpClient,HttpHeaders} from "@angular/common/http";
import {Observable} from "rxjs";

const httpOptions = {
  headers: new HttpHeaders({
    'Content-Type': 'application/json'
  })
}
@Injectable({
  providedIn: 'root'
})
export class TaskService {
  private apiurl = 'https://luxurious-fifth-tarascosaurus.glitch.me/tasks/'

  constructor(private http:HttpClient) { }

  getTasks(): Observable<any> {
    return this.http.get<Task>(this.apiurl);
  }
  addEx(task:Task):Observable<Task>{
    return this.http.post<Task>(this.apiurl,task,httpOptions);
  }
  deleteTask(task: Task):Observable<Task> {
    const url = this.apiurl+task.id;
    return this.http.delete<Task>(url);
  }
}
