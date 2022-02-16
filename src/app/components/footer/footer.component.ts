import {Component, Injectable, Input, OnInit} from '@angular/core';
import {TaskService} from "../../sevice/task.service";
import {Task} from "../../Task";
import { faTimes } from '@fortawesome/free-solid-svg-icons';
import {sum, getSum, setSum} from "../../../environments/environment";
import {HttpClient,HttpHeaders} from "@angular/common/http";
import {TasksComponent} from "../tasks/tasks.component";
import {Observable} from "rxjs";

@Injectable({ providedIn: 'root' })

@Component({
  selector: 'app-footer',
  templateUrl: './footer.component.html',
  styleUrls: ['./footer.component.css']
})
export class FooterComponent implements OnInit {
  @Input() task!: Task;
  tasks: Task[] = []
  private apiurl = 'http://localhost:3000/tasks/'
  faTimes = faTimes;
  sum:number = sum;

  constructor(private tc:TasksComponent, private ts:TaskService,private http:HttpClient) {}

  ngOnInit(): void {}

  getS() {
    return this.sum = getSum()
  }
  erase(){
    console.log(this.task)
  }

}
